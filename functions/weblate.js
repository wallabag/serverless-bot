import { WeblateHandler } from './classes/WeblateHandler'

const weblate = new WeblateHandler(process.env.GITHUB_TOKEN)

export async function handler(event, context, callback) {
  await weblate.handle(JSON.parse(event.body), callback)
}
