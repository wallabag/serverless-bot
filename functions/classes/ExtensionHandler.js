import got from 'got'
import parse from 'diffparser'
import { Handler } from './Handler.js'

export class ExtensionHandler extends Handler {
  constructor(githubToken, namespace) {
    super(githubToken)

    this.namespace = namespace
  }

  async handle(body) {
    let response = this.validateEvent(body)

    if (response !== true) {
      return response
    }

    console.log(`Working on repo ${body.repository.full_name} for PR #${body.pull_request.number}`)

    const payload = {
      success: {
        state: 'success',
        description: 'passed',
        context: `${this.namespace} - File extension check`,
      },
      failure: {
        state: 'failure',
        description: 'failed',
        context: `${this.namespace} - File extension check`,
      },
    }

    let diffResponse
    try {
      diffResponse = await got(body.pull_request.diff_url)
    } catch (e) {
      const statusCode = e.response?.statusCode
      const statusMessage = e.response?.statusMessage
      const errorMessage =
        typeof statusCode === 'number'
          ? `Response code ${statusCode}${statusMessage ? ` (${statusMessage})` : ''}`
          : e.message

      console.log(errorMessage)

      return {
        statusCode: 500,
        body: errorMessage,
      }
    }

    const validation = parse(diffResponse.body).every((diff) => {
      // we don't need to validate deleted file
      if (diff.deleted === true) {
        return true
      }

      if (/\.txt$/.test(diff.to) === false) {
        payload.failure.description = `Fail: "${diff.to}" has not a txt extension`

        console.log(`Fail: "${diff.to}" has not a txt extension`)

        return false
      }

      return true
    })

    response = await this.updateStatus(body, validation ? payload.success : payload.failure)

    return response
  }
}
