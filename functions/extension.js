import got from 'got'
import parse from 'diffparser'
import { client } from 'octonode'
import { updateStatus, validateWebhook } from './utils/github'

export async function handler(event, context, callback) {
  let response
  const githubClient = client(process.env.GITHUB_TOKEN)

  const body = JSON.parse(event.body)

  // when creating the webhook
  if (body && 'hook' in body) {
    try {
      const message = validateWebhook(body)

      console.log(message)

      response = {
        statusCode: 200,
        body: message,
      }
    } catch (e) {
      console.log(e.message)

      response = {
        statusCode: 500,
        body: e.message,
      }
    }

    return callback(null, response)
  }

  if (!(body && 'pull_request' in body)) {
    response = {
      statusCode: 500,
      body: 'Event is not a Pull Request',
    }

    return callback(null, response)
  }

  console.log(`Working on repo ${body.repository.full_name} for PR #${body.pull_request.number}`)

  const payload = {
    success: {
      state: 'success',
      description: 'passed',
      context: `${process.env.NAMESPACE} - File extension check`,
    },
    failure: {
      state: 'failure',
      description: 'failed',
      context: `${process.env.NAMESPACE} - File extension check`,
    },
  }

  let diffResponse
  try {
    diffResponse = await got(body.pull_request.diff_url)
  } catch (e) {
    console.log(e.message)

    response = {
      statusCode: 500,
      body: e.message,
    }

    return callback(null, response)
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

  response = await updateStatus(githubClient, body, validation ? payload.success : payload.failure)

  return callback(null, response)
}
