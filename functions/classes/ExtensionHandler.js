import got from 'got'
import parse from 'diffparser'
import { Handler } from './Handler'

export class ExtensionHandler extends Handler {
  constructor(githubToken, namespace, fetch = null) {
    super(githubToken, fetch)

    this.namespace = namespace
  }

  async handle(body, callback) {
    let response = this.validateEvent(body)

    if (response !== true) {
      return callback(null, response)
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
      console.log(e.message)

      return callback(null, {
        statusCode: 500,
        body: e.message,
      })
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

    return callback(null, response)
  }
}
