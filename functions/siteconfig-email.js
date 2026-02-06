import { SiteconfigEmailHandler } from './classes/SiteconfigEmailHandler.js'

const siteconfigEmailHandler = new SiteconfigEmailHandler(process.env.GITHUB_TOKEN)

export async function handler(event) {
  return siteconfigEmailHandler.handle(event)
}
