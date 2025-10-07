import 'aws-sdk-client-mock-jest'
import { mockClient } from 'aws-sdk-client-mock'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { sdkStreamMixin } from '@smithy/util-stream'
import { Readable } from 'stream'
import { SiteconfigEmailHandler } from '../functions/classes/SiteconfigEmailHandler'

/**
 * Helper function to create email content with custom headers
 */
const createEmailContentWithHeaders = (from, subject, body, headers) => {
  let emailContent = `From: ${from}
To: siteconfig@aws.wallabag.org
Subject: ${subject}`

  if (headers.inReplyTo) {
    emailContent += `\nIn-Reply-To: ${headers.inReplyTo}`
  }

  if (headers.references) {
    emailContent += `\nReferences: ${headers.references.join(' ')}`
  }

  emailContent += `\nContent-Type: text/plain; charset=UTF-8

${body}`

  return emailContent
}

/**
 * Helper function to create SES SNS event with inline content and custom headers
 */
const createSESEventInlineWithHeaders = (from, subject, body, headers) => {
  const emailContent = createEmailContentWithHeaders(from, subject, body, headers)

  return {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            mail: {
              source: from,
              messageId: 'test-message-id',
              commonHeaders: {
                from: [from],
                to: ['siteconfig@aws.wallabag.org'],
                subject,
              },
            },
            content: emailContent,
          }),
        },
      },
    ],
  }
}

/**
 * Helper function to create email content
 */
const createEmailContent = (from, subject, body) => `From: ${from}
To: siteconfig@aws.wallabag.org
Subject: ${subject}
Content-Type: text/plain; charset=UTF-8

${body}`

/**
 * Helper function to create SES SNS event with inline content
 */
const createSESEventInline = (from, subject, body) => {
  const emailContent = createEmailContent(from, subject, body)

  return {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            mail: {
              source: from,
              messageId: 'test-message-id',
              commonHeaders: {
                from: [from],
                to: ['siteconfig@aws.wallabag.org'],
                subject,
              },
            },
            content: emailContent,
          }),
        },
      },
    ],
  }
}

/**
 * Helper function to create SES SNS event with S3 storage
 */
const createSESEventS3 = (from, subject, bucketName, objectKey) => ({
  Records: [
    {
      Sns: {
        Message: JSON.stringify({
          mail: {
            source: from,
            messageId: 'test-message-id',
            commonHeaders: {
              from: [from],
              to: ['siteconfig@aws.wallabag.org'],
              subject,
            },
          },
          receipt: {
            action: {
              type: 'S3',
              bucketName,
              objectKey,
            },
          },
        }),
      },
    },
  ],
})

// Mock SES and S3 clients
const sesMock = mockClient(SESClient)
const s3Mock = mockClient(S3Client)

// Mock Octokit
const mockCreateIssue = jest.fn()
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: {
        create: mockCreateIssue,
      },
    },
  })),
}))

describe('Site config email trigger', () => {
  let emailHandler
  let mockCallback

  beforeEach(() => {
    jest.clearAllMocks()
    sesMock.reset()
    s3Mock.reset()

    emailHandler = new SiteconfigEmailHandler('test-github-token')
    mockCallback = jest.fn()

    // Setup default mock responses
    sesMock.on(SendEmailCommand).resolves({})

    mockCreateIssue.mockResolvedValue({
      data: {
        number: 123,
        html_url: 'https://github.com/wallabag/wallabag/issues/123',
      },
    })
  })

  describe('Reply detection', () => {
    test('should detect reply with Re: prefix in subject', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'Re: Original Subject',
        'This is a reply'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
      expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand)
      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining('Email is a reply'),
      })
    })

    test('should detect reply with RE: prefix (uppercase)', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'RE: Original Subject',
        'This is a reply'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with In-Reply-To header', async () => {
      const event = createSESEventInlineWithHeaders(
        'sender@example.com',
        'Follow up question',
        'My question',
        {
          inReplyTo: '<original-message-id@example.com>',
        }
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with References header', async () => {
      const event = createSESEventInlineWithHeaders(
        'sender@example.com',
        'Follow up',
        'My follow up',
        {
          references: ['<message-1@example.com>', '<message-2@example.com>'],
        }
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with quoted text (> prefix)', async () => {
      const bodyWithQuote = `My reply here

> Original message
> that was quoted`

      const event = createSESEventInline('sender@example.com', 'Question', bodyWithQuote)

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with "On ... wrote:" pattern', async () => {
      const bodyWithQuote = `My reply

On Mon, Jan 1, 2024 at 10:00 AM, John Doe <john@example.com> wrote:
Original message here`

      const event = createSESEventInline('sender@example.com', 'Question', bodyWithQuote)

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with French "Le ... a écrit :" pattern', async () => {
      const bodyWithQuote = `Ma réponse

Le lun. 1 janv. 2024 à 10:00, Jean Dupont <jean@example.com> a écrit :
Message original`

      const event = createSESEventInline('sender@example.com', 'Question', bodyWithQuote)

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should detect reply with Aw: prefix (Dutch)', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'Aw: Original Subject',
        'This is a reply'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).not.toHaveBeenCalled()
    })

    test('should process non-reply emails normally', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'New Request',
        'This is a new request without any reply indicators'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalled()
      expect(sesMock).toHaveReceivedCommandTimes(SendEmailCommand, 1)
    })

    test('should not be fooled by Re: in middle of subject', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'Question about Re: header',
        'My question'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalled()
    })
  })

  describe('Email processing with inline content', () => {
    test('should process email with inline content and create GitHub issue', async () => {
      const event = createSESEventInline(
        'sender@example.com',
        'Test Subject',
        'Test email body content'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith({
        owner: 'wallabag',
        repo: 'wallabag',
        title: 'Test Subject',
        body: expect.stringContaining('s***r@example.com'),
        labels: ['Site Config'],
      })

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining('Email processed successfully'),
      })
    })

    test('should extract text content from inline email', async () => {
      const event = createSESEventInline(
        'user@example.com',
        'My Request',
        'This is my request content'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Request',
          body: expect.stringContaining('This is my request content'),
        })
      )
    })
  })

  describe('Email processing with S3 storage', () => {
    test('should fetch email from S3 and create GitHub issue', async () => {
      const emailContent = createEmailContent(
        'sender@example.com',
        'Test Subject from S3',
        'Test body from S3'
      )

      // Mock S3 response with SDK stream mixin
      const stream = new Readable()
      stream.push(emailContent)
      stream.push(null)
      const sdkStream = sdkStreamMixin(stream)

      s3Mock.on(GetObjectCommand).resolves({
        Body: sdkStream,
      })

      const event = createSESEventS3(
        'sender@example.com',
        'Test Subject from S3',
        'test-bucket',
        'incoming/test-email-id'
      )

      await emailHandler.handle(event, mockCallback)

      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: 'test-bucket',
        Key: 'incoming/test-email-id',
      })

      expect(mockCreateIssue).toHaveBeenCalledWith({
        owner: 'wallabag',
        repo: 'wallabag',
        title: 'Test Subject from S3',
        body: expect.stringContaining('s***r@example.com'),
        labels: ['Site Config'],
      })

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining('Email processed successfully'),
      })
    })

    test('should handle S3 fetch errors gracefully', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('S3 access denied'))

      const event = createSESEventS3(
        'sender@example.com',
        'Test Subject',
        'test-bucket',
        'incoming/test-email-id'
      )

      await emailHandler.handle(event, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 500,
        body: expect.stringContaining('Error processing email'),
      })
    })
  })

  describe('Confirmation email', () => {
    test('should send confirmation email after issue creation', async () => {
      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(sesMock).toHaveReceivedCommandWith(SendEmailCommand, {
        Source: 'siteconfig@aws.wallabag.org',
        Destination: {
          ToAddresses: ['sender@example.com'],
        },
        Message: expect.objectContaining({
          Subject: expect.objectContaining({
            Data: 'Your wallabag site configuration request has been received',
          }),
        }),
      })
    })

    test('should include issue URL in confirmation email', async () => {
      await emailHandler.sendConfirmationEmail(
        'test@example.com',
        'https://github.com/wallabag/wallabag/issues/123',
        123
      )

      expect(sesMock).toHaveReceivedCommandWith(SendEmailCommand, {
        Message: expect.objectContaining({
          Body: expect.objectContaining({
            Text: expect.objectContaining({
              Data: expect.stringContaining('https://github.com/wallabag/wallabag/issues/123'),
            }),
            Html: expect.objectContaining({
              Data: expect.stringContaining('Issue #123'),
            }),
          }),
        }),
      })
    })

    test('should call SES send exactly once per email', async () => {
      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(sesMock).toHaveReceivedCommandTimes(SendEmailCommand, 1)
    })
  })

  describe('GitHub issue creation', () => {
    test('should format issue body correctly', async () => {
      const senderEmail = 't***t@example.com'
      const emailBody = 'This is the email content\nWith multiple lines'
      const subject = 'Test Subject'

      await emailHandler.createGithubIssue(subject, emailBody, senderEmail)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: `*Sent by ${senderEmail} and automatically created by email*

---

${emailBody}`,
        })
      )
    })

    test('should apply "Site Config" label to created issue', async () => {
      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['Site Config'],
        })
      )
    })

    test('should create issue on wallabag/wallabag repository', async () => {
      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'wallabag',
          repo: 'wallabag',
        })
      )
    })
  })

  describe('Error handling', () => {
    test('should handle GitHub API errors gracefully', async () => {
      mockCreateIssue.mockRejectedValue(new Error('GitHub API error'))

      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 500,
        body: expect.stringContaining('Error processing email'),
      })
    })

    test('should handle SES send email errors gracefully', async () => {
      sesMock.on(SendEmailCommand).rejects(new Error('SES error'))

      const event = createSESEventInline('sender@example.com', 'Test Subject', 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 500,
        body: expect.stringContaining('Error processing email'),
      })
    })

    test('should handle missing email content gracefully', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                mail: {
                  source: 'sender@example.com',
                  messageId: 'test-message-id',
                  commonHeaders: {
                    subject: 'Test',
                  },
                },
                // No content and no S3 receipt
              }),
            },
          },
        ],
      }

      await emailHandler.handle(event, mockCallback)

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 500,
        body: expect.stringContaining('Unable to retrieve email content'),
      })
    })
  })

  describe('Email parsing', () => {
    test('should parse multiline email body', async () => {
      const multilineBody = 'Line 1\nLine 2\nLine 3\n\nLine 5'
      const event = createSESEventInline('sender@example.com', 'Multiline Test', multilineBody)

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining(multilineBody),
        })
      )
    })

    test('should handle emails with special characters in subject', async () => {
      const specialSubject = 'Test with émojis 🎉 and special chars: <>&"'
      const event = createSESEventInline('sender@example.com', specialSubject, 'Test body')

      await emailHandler.handle(event, mockCallback)

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: specialSubject,
        })
      )
    })
  })

  describe('Email masking', () => {
    test('should mask email address with first and last character', () => {
      expect(emailHandler.maskEmail('john.doe@example.com')).toBe('j***e@example.com')
      expect(emailHandler.maskEmail('alice@domain.org')).toBe('a***e@domain.org')
      expect(emailHandler.maskEmail('bob.smith@company.co.uk')).toBe('b***h@company.co.uk')
    })

    test('should mask very short email addresses', () => {
      expect(emailHandler.maskEmail('ab@example.com')).toBe('a***@example.com')
      expect(emailHandler.maskEmail('x@test.com')).toBe('x***@test.com')
    })

    test('should handle invalid email addresses', () => {
      expect(emailHandler.maskEmail('not-an-email')).toBe('[invalid email]')
      expect(emailHandler.maskEmail('')).toBe('[invalid email]')
      expect(emailHandler.maskEmail(null)).toBe('[invalid email]')
    })

    test('should create GitHub issue with masked sender email', async () => {
      await emailHandler.createGithubIssue('Test Subject', 'Test body', 'john.doe@example.com')

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('j***e@example.com'),
        })
      )

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.stringContaining('john.doe@example.com'),
        })
      )
    })

    test('should mask email addresses in body content', () => {
      const body = `Please contact me at john.doe@example.com or alice@company.org`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***e@example.com')
      expect(cleaned).toContain('a***e@company.org')
      expect(cleaned).not.toContain('john.doe@example.com')
      expect(cleaned).not.toContain('alice@company.org')
    })

    test('should mask multiple email addresses in body', () => {
      const body = `Team members:
- john@example.com
- alice.smith@example.com
- bob@company.org`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***n@example.com')
      expect(cleaned).toContain('a***h@example.com')
      expect(cleaned).toContain('b***b@company.org')
    })

    test('should mask email addresses with plus addressing', () => {
      const body = `Contact: john+test@example.com`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***t@example.com')
      expect(cleaned).not.toContain('john+test@example.com')
    })
  })

  describe('Email masking', () => {
    test('should mask email address with first and last character', () => {
      expect(emailHandler.maskEmail('john.doe@example.com')).toBe('j***e@example.com')
      expect(emailHandler.maskEmail('alice@domain.org')).toBe('a***e@domain.org')
      expect(emailHandler.maskEmail('bob.smith@company.co.uk')).toBe('b***h@company.co.uk')
    })

    test('should mask very short email addresses', () => {
      expect(emailHandler.maskEmail('ab@example.com')).toBe('a***@example.com')
      expect(emailHandler.maskEmail('x@test.com')).toBe('x***@test.com')
    })

    test('should handle invalid email addresses', () => {
      expect(emailHandler.maskEmail('not-an-email')).toBe('[invalid email]')
      expect(emailHandler.maskEmail('')).toBe('[invalid email]')
      expect(emailHandler.maskEmail(null)).toBe('[invalid email]')
    })

    test('should create GitHub issue with masked sender email', async () => {
      await emailHandler.createGithubIssue('Test Subject', 'Test body', 'john.doe@example.com')

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('j***e@example.com'),
        })
      )

      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.stringContaining('john.doe@example.com'),
        })
      )
    })

    test('should mask email addresses in body content', () => {
      const body = `Please contact me at john.doe@example.com or alice@company.org`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***e@example.com')
      expect(cleaned).toContain('a***e@company.org')
      expect(cleaned).not.toContain('john.doe@example.com')
      expect(cleaned).not.toContain('alice@company.org')
    })

    test('should mask multiple email addresses in body', () => {
      const body = `Team members:
- john@example.com
- alice.smith@example.com
- bob@company.org`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***n@example.com')
      expect(cleaned).toContain('a***h@example.com')
      expect(cleaned).toContain('b***b@company.org')
    })

    test('should mask email addresses with plus addressing', () => {
      const body = `Contact: john+test@example.com`

      const cleaned = emailHandler.cleanEmailBody(body)

      expect(cleaned).toContain('j***t@example.com')
      expect(cleaned).not.toContain('john+test@example.com')
    })
  })
})
