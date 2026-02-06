import { WeblateHandler } from './classes/WeblateHandler.js'

const weblate = new WeblateHandler(process.env.GITHUB_TOKEN)

export async function handler(event) {
  return weblate.handle(JSON.parse(event.body))
}
