import { ExtensionHandler } from './classes/ExtensionHandler'

const extension = new ExtensionHandler(process.env.GITHUB_TOKEN, process.env.NAMESPACE)

export async function handler(event, context, callback) {
  await extension.handle(JSON.parse(event.body), callback)
}
