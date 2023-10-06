import { Handler } from './Handler'

export class WeblateHandler extends Handler {
  async handle(body, callback) {
    const response = this.validateEvent(body)

    if (response !== true) {
      return callback(null, response)
    }

    console.log(`Working on repo ${body.repository.full_name} for PR #${body.pull_request.number}`)

    if (body.pull_request.user.login !== 'weblate' || body.sender.login !== 'weblate') {
      return callback(null, {
        statusCode: 204,
        body: 'PR is not from Weblate',
      })
    }

    const owner = body.repository.owner.login
    const repo = body.repository.name

    await this.githubClient.request(
      `POST /repos/${owner}/${repo}/issues/${body.pull_request.number}/labels`,
      {
        labels: ['Translations'],
      }
    )

    console.log('Labelled!')

    return callback(null, {
      statusCode: 204,
      body: 'Process finished',
    })
  }
}
