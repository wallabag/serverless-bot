import { SiteconfigEmailHandler } from './classes/SiteconfigEmailHandler'

const siteconfigEmailHandler = new SiteconfigEmailHandler(process.env.GITHUB_TOKEN)

export async function handler(event, context, callback) {
  await siteconfigEmailHandler.handle(event, callback)
}
