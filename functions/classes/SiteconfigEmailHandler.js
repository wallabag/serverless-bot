import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { simpleParser } from 'mailparser'
import { Handler } from './Handler'

export class SiteconfigEmailHandler extends Handler {
  constructor(githubToken) {
    super(githubToken)

    this.sesClient = new SESClient({ region: process.env.AWS_REGION || 'eu-west-1' })
    this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' })
  }

  async handle(event, callback) {
    try {
      console.log('Received SES email event')
      console.log(JSON.stringify(event))

      // Parse the SNS message containing SES notification
      const snsMessage = JSON.parse(event.Records[0].Sns.Message)

      let emailContent

      // Check if email content is in S3 or inline
      if (snsMessage.receipt && snsMessage.receipt.action.type === 'S3') {
        // Email is stored in S3
        const s3Info = snsMessage.receipt.action
        console.log(`Fetching email from S3: ${s3Info.bucketName}/${s3Info.objectKey}`)

        const command = new GetObjectCommand({
          Bucket: s3Info.bucketName,
          Key: s3Info.objectKey,
        })

        const response = await this.s3Client.send(command)
        emailContent = await response.Body.transformToString()
      } else if (snsMessage.content) {
        // Email content is inline
        emailContent = snsMessage.content
      } else {
        throw new Error('Unable to retrieve email content')
      }

      // Parse email
      const parsed = await simpleParser(emailContent)

      const senderEmail = parsed.from.text
      const senderName = parsed.from?.value?.[0]?.name || null
      const { subject } = snsMessage.mail.commonHeaders
      const body = parsed.text || parsed.html || ''

      console.log(`Processing email from: ${senderEmail}, subject: ${subject}`)

      // Check if this is a reply/response email
      if (this.isReplyEmail(subject, parsed)) {
        console.log('Email detected as a reply - skipping issue creation')

        return callback(null, {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Email is a reply - no action taken',
            reason: 'Reply emails are not processed',
          }),
        })
      }

      // Clean the email body before creating the issue
      const cleanedBody = this.cleanEmailBody(body)

      // Create GitHub issue
      const issue = await this.createGithubIssue(subject, cleanedBody, senderName)
      console.log(`Created GitHub issue #${issue.number}: ${issue.html_url}`)

      // Send confirmation email
      await this.sendConfirmationEmail(senderEmail, issue.html_url, issue.number)
      console.log(`Sent confirmation email to: ${senderEmail}`)

      return callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Email processed successfully',
          issueNumber: issue.number,
          issueUrl: issue.html_url,
        }),
      })
    } catch (e) {
      console.error('Error processing email:', e)

      return callback(null, {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Error processing email',
          error: e.message,
        }),
      })
    }
  }

  /**
   * Mask email address for privacy
   * Example: john.doe@example.com -> j***e@example.com
   *
   * @param {string} email - Email address to mask
   * @return {string} Masked email address
   */
  // eslint-disable-next-line class-methods-use-this
  maskEmail(email) {
    if (!email || typeof email !== 'string') {
      return '[invalid email]'
    }

    const parts = email.split('@')
    if (parts.length !== 2) {
      return '[invalid email]'
    }

    const [localPart, domain] = parts

    // If local part is very short (1-2 chars), show first char only
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`
    }

    // For longer local parts, show first and last character
    const firstChar = localPart[0]
    const lastChar = localPart[localPart.length - 1]
    const maskedLocal = `${firstChar}***${lastChar}`

    return `${maskedLocal}@${domain}`
  }

  /**
   * Clean email body by removing sensitive information and email artifacts
   *
   * @param {string} body - Raw email body
   * @return {string} Cleaned email body
   */
  cleanEmailBody(body) {
    let cleaned = body

    // Remove email signatures (common patterns)
    // Match lines after "-- " (standard signature delimiter)
    cleaned = cleaned.replace(/\n--\s*\n[\s\S]*$/m, '')

    // Remove common signature markers
    const signaturePatterns = [
      /\n\s*-+\s*\n.*?(?:sent from|envoyé de|enviado desde).*/gis,
      /\n\s*sent from my (iphone|ipad|android|mobile|phone).*/gi,
      /\n\s*envoyé de mon (iphone|ipad|android|mobile|téléphone).*/gi,
      /\n\s*get outlook for (ios|android).*/gi,
      /\n\s*télécharger outlook pour (ios|android).*/gi,
    ]

    signaturePatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '')
    })

    // Remove email headers that might be included in forwarded messages
    const headerPatterns = [
      /^(from|de|von|från):\s*.+$/gim,
      /^(to|à|an|till):\s*.+$/gim,
      /^(sent|date|envoyé|gesendet|skickat):\s*.+$/gim,
      /^(cc|bcc):\s*.+$/gim,
      /^subject:\s*.+$/gim,
    ]

    headerPatterns.forEach((pattern) => {
      // Only remove if it appears at the start of a line with other headers nearby
      if (cleaned.match(pattern)) {
        const lines = cleaned.split('\n')
        let headerCount = 0
        let startIndex = -1

        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            if (startIndex === -1) {
              startIndex = index
            }
            headerCount += 1
          }
        })

        // If we found multiple header-like lines together, remove them
        if (headerCount >= 2) {
          cleaned = cleaned.replace(pattern, '')
        }
      }
    })

    // Remove quoted replies (lines starting with >)
    cleaned = cleaned.replace(/^>+.+$/gm, '')

    // Remove "On ... wrote:" patterns (quoted email headers)
    cleaned = cleaned.replace(/^on\s+.+?\s+wrote:\s*$/gim, '')
    cleaned = cleaned.replace(/^le\s+.+?\s+a écrit\s*:\s*$/gim, '')
    cleaned = cleaned.replace(/^am\s+.+?\s+schrieb:\s*$/gim, '')
    cleaned = cleaned.replace(/^el\s+.+?\s+escribió:\s*$/gim, '')

    // Remove "Original Message" dividers
    cleaned = cleaned.replace(/^-+\s*original message\s*-+$/gim, '')
    cleaned = cleaned.replace(/^-+\s*message d'origine\s*-+$/gim, '')

    // Mask email addresses in the body content
    cleaned = cleaned.replace(/([\w.+-]+)@([\w.-]+\.\w+)/g, (match) => this.maskEmail(match))

    // Remove phone numbers (various formats)
    cleaned = cleaned.replace(
      /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[phone redacted]'
    )

    // Remove credit card numbers (basic pattern)
    cleaned = cleaned.replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      '[card number redacted]'
    )

    // Remove potential passwords or tokens (sequences like "password: xyz123")
    cleaned = cleaned.replace(
      /(password|passwd|pwd|token|api[-_]?key|secret):\s*\S+/gi,
      '$1: [redacted]'
    )

    // Clean up excessive blank lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

    // Trim leading and trailing whitespace
    cleaned = cleaned.trim()

    console.log(`Email body cleaned: ${body.length} -> ${cleaned.length} characters`)

    return cleaned
  }

  /**
   * Detect if an email is a reply based on various indicators
   *
   * @param {string} subject - Email subject
   * @param {object} parsed - Parsed email object from mailparser
   * @return {boolean} true if email is detected as a reply
   */
  // eslint-disable-next-line class-methods-use-this
  isReplyEmail(subject, parsed) {
    // Check 1: Subject starts with Re: or RE: (case insensitive)
    if (/^re:/i.test(subject.trim())) {
      console.log('Reply detected: Subject starts with Re:')

      return true
    }

    // Check 2: In-Reply-To header exists
    if (parsed.inReplyTo) {
      console.log(`Reply detected: In-Reply-To header present: ${parsed.inReplyTo}`)

      return true
    }

    // Check 3: References header exists (thread reference)
    if (parsed.references && parsed.references.length > 0) {
      console.log(`Reply detected: References header present: ${parsed.references}`)

      return true
    }

    // Check 4: Common reply prefixes in other languages
    const replyPrefixes = [
      /^re:/i, // English, French
      /^aw:/i, // Dutch (Antwoord)
      /^sv:/i, // Swedish (Svar)
      /^vs:/i, // Danish (Vedrørende Svar)
      /^rif:/i, // Italian (Riferimento)
      /^ref:/i, // Portuguese (Referência)
      /^antw:/i, // German (Antwort)
      /^odp:/i, // Polish (Odpowiedź)
      /^回复:/i, // Chinese
      /^답장:/i, // Korean
    ]

    // eslint-disable-next-line no-restricted-syntax
    for (const prefix of replyPrefixes) {
      if (prefix.test(subject.trim())) {
        console.log(`Reply detected: Subject matches reply prefix ${prefix}`)

        return true
      }
    }

    // Check 5: Common reply patterns in body (quoted text indicators)
    const bodyText = parsed.text || ''
    const quotedTextPatterns = [
      /^on .* wrote:/im, // "On [date] [person] wrote:"
      /^le .* a écrit :/im, // French "Le [date] [person] a écrit :"
      /^am .* schrieb:/im, // German "Am [date] schrieb:"
      /^el .* escribió:/im, // Spanish "El [date] escribió:"
      /^-{3,}\s*original message\s*-{3,}/im,
      /^>{1,}\s/m, // Lines starting with > (quoted text)
    ]

    // eslint-disable-next-line no-restricted-syntax
    for (const pattern of quotedTextPatterns) {
      if (pattern.test(bodyText.substring(0, 500))) {
        console.log(`Reply detected: Body contains quoted text pattern ${pattern}`)

        return true
      }
    }

    console.log('Email does not appear to be a reply')

    return false
  }

  async createGithubIssue(subject, body, senderName = null) {
    const sender = senderName || 'an anonymous user'
    const issueBody = `*Sent by ${sender} and automatically created by email*

---

${body}`

    const response = await this.githubClient.rest.issues.create({
      owner: 'wallabag',
      repo: 'wallabag',
      title: subject,
      body: issueBody,
      labels: ['Site Config'],
    })

    return response.data
  }

  async sendConfirmationEmail(recipientEmail, issueUrl, issueNumber) {
    const params = {
      Source: 'siteconfig@aws.wallabag.org',
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: {
          Data: 'Your wallabag site configuration request has been received',
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `Hello,

Thank you for contacting wallabag site configuration support.

Your email has been received and a GitHub issue has been automatically created to track your request.

Issue #${issueNumber}: ${issueUrl}

Our team will review your request and respond on the GitHub issue.
If someone replies there, you will NOT receive an email notification.

Helpful links:
- Wallabagger: https://github.com/wallabag/wallabag/wiki/Wallabagger, an add-on for desktop browsers
- Auto-update site dependent config files: https://github.com/wallabag/wallabag/wiki/Auto%E2%80%90Updating-wallabag's-site%E2%80%90depended-config to always stay up-to-date (self-hosters only)

Best regards,
The wallabag team

---
Please do not reply to this email. Any responses will not be processed.`,
            Charset: 'UTF-8',
          },
          Html: {
            Data: `<html>
<body>
<p>Hello,</p>
<p>Thank you for contacting wallabag site configuration support.</p>
<p>Your email has been received and a GitHub issue has been automatically created to track your request.</p>
<p><strong>Issue #${issueNumber}:</strong> <a href="${issueUrl}">${issueUrl}</a></p>
<p>Our team will review your request and respond on the GitHub issue.</p>
<p><i>If someone replies there, you will NOT receive an email notification.</i></p>
<p>Helpful links:</p>
<ul>
<li><a href="https://github.com/wallabag/wallabag/wiki/Wallabagger">Wallabagger</a>, an add-on for desktop browsers</li>
<li><a href="https://github.com/wallabag/wallabag/wiki/Auto%E2%80%90Updating-wallabag's-site%E2%80%90depended-config">Auto-update site dependent config files</a> to always stay up-to-date (self-hosters only)</li>
</ul>
<p>Best regards,<br>The wallabag team</p>
<hr>
<p><small>Please do not reply to this email. Any responses will not be processed.</small></p>
</body>
</html>`,
            Charset: 'UTF-8',
          },
        },
      },
    }

    const command = new SendEmailCommand(params)

    await this.sesClient.send(command)
  }
}
