import { ExtensionHandler } from './classes/ExtensionHandler.js'

const extension = new ExtensionHandler(process.env.GITHUB_TOKEN, process.env.NAMESPACE)

export async function handler(event) {
  return extension.handle(JSON.parse(event.body))
}
