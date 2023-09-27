import nock from 'nock'
import fetchMock from 'fetch-mock'
import { ExtensionHandler } from '../functions/classes/ExtensionHandler'
import { handler } from '../functions/extension'

describe('Validating GitHub event', () => {
  test('bad event body', async () => {
    const callback = jest.fn()

    await handler({ body: '{}' }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Event is not a Pull Request',
      statusCode: 500,
    })
  })

  test('hook event does not include PR', async () => {
    const callback = jest.fn()
    const githubEvent = {
      zen: 'Speak like a human.',
      hook_id: 1,
      hook: {
        events: ['issue', 'push'],
      },
      repository: {
        full_name: '20minutes/serverless-github-check',
      },
      sender: {
        login: 'diego',
      },
    }

    await handler({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'This webhook needs the "pull_request" event. Please tick it.',
      statusCode: 500,
    })
  })

  test('hook event is ok', async () => {
    const callback = jest.fn()
    const githubEvent = {
      zen: 'Speak like a human.',
      hook_id: 1,
      hook: {
        events: ['pull_request', 'push'],
      },
      repository: {
        full_name: '20minutes/serverless-github-check',
      },
      sender: {
        login: 'diego',
      },
    }

    await handler({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Hello diego, the webhook is now enabled for 20minutes/serverless-github-check, enjoy!',
      statusCode: 200,
    })
  })

  test('hook event for an organization is ok', async () => {
    const callback = jest.fn()
    const githubEvent = {
      zen: 'Speak like a human.',
      hook_id: 1,
      hook: {
        events: ['pull_request', 'push'],
      },
      organization: {
        login: '20minutes',
      },
      sender: {
        login: 'diego',
      },
    }

    await handler({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Hello diego, the webhook is now enabled for the organization 20minutes, enjoy!',
      statusCode: 200,
    })
  })
})

describe('Validating extension', () => {
  test('fail to retrieve the diff', async () => {
    nock('http://git.hub').get('/diff').reply(404)

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        number: 42,
        diff_url: 'http://git.hub/diff',
        head: {
          sha: 'ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        },
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
    }

    await handler({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Response code 404 (Not Found)',
      statusCode: 500,
    })
  })

  test('file extension is not txt', async () => {
    const mock = fetchMock
      .sandbox()
      .mock(
        'https://api.github.com/repos/foo/bar/statuses/ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        200
      )

    nock('http://git.hub').get('/diff').replyWithFile(200, `${__dirname}/fixtures/no_txt.diff`)

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        number: 42,
        diff_url: 'http://git.hub/diff',
        head: {
          sha: 'ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        },
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
    }

    const extension = new ExtensionHandler('GH_TOKEN', 'Test config', mock)
    await extension.handle(githubEvent, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Process finished with state: failure',
      statusCode: 204,
    })

    const lastOptions = JSON.parse(mock.lastOptions().body)
    expect(lastOptions).toStrictEqual({
      context: 'Test config - File extension check',
      description: 'Fail: "theatlantic.com" has not a txt extension',
      state: 'failure',
    })
  })

  test('at least one file extension is not txt', async () => {
    const mock = fetchMock
      .sandbox()
      .mock(
        'https://api.github.com/repos/foo/bar/statuses/ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        200
      )

    nock('http://git.hub')
      .get('/diff')
      .replyWithFile(200, `${__dirname}/fixtures/only_one_with.txt.diff`)

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        number: 42,
        diff_url: 'http://git.hub/diff',
        head: {
          sha: 'ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        },
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
    }

    const extension = new ExtensionHandler('GH_TOKEN', 'Test config', mock)
    await extension.handle(githubEvent, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Process finished with state: failure',
      statusCode: 204,
    })

    const lastOptions = JSON.parse(mock.lastOptions().body)
    expect(lastOptions).toStrictEqual({
      context: 'Test config - File extension check',
      description: 'Fail: "wow.gamona.de" has not a txt extension',
      state: 'failure',
    })
  })

  test('one deleted file', async () => {
    const mock = fetchMock
      .sandbox()
      .mock(
        'https://api.github.com/repos/foo/bar/statuses/ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        200
      )

    nock('http://git.hub')
      .get('/diff')
      .replyWithFile(200, `${__dirname}/fixtures/with_deleted_file.txt.diff`)

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        number: 42,
        diff_url: 'http://git.hub/diff',
        head: {
          sha: 'ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        },
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
    }

    const extension = new ExtensionHandler('GH_TOKEN', 'Test config', mock)
    await extension.handle(githubEvent, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Process finished with state: success',
      statusCode: 204,
    })

    const lastOptions = JSON.parse(mock.lastOptions().body)
    expect(lastOptions).toStrictEqual({
      context: 'Test config - File extension check',
      description: 'passed',
      state: 'success',
    })
  })

  test('file extension is ok', async () => {
    const mock = fetchMock
      .sandbox()
      .mock(
        'https://api.github.com/repos/foo/bar/statuses/ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        200
      )

    nock('http://git.hub').get('/diff').replyWithFile(200, `${__dirname}/fixtures/with_a.txt.diff`)

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        number: 42,
        diff_url: 'http://git.hub/diff',
        head: {
          sha: 'ee55a1223ce20c3e7cb776349cb7f8efb7b88511',
        },
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
    }

    const extension = new ExtensionHandler('GH_TOKEN', 'Test config', mock)
    await extension.handle(githubEvent, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Process finished with state: success',
      statusCode: 204,
    })

    const lastOptions = JSON.parse(mock.lastOptions().body)
    expect(lastOptions).toStrictEqual({
      context: 'Test config - File extension check',
      description: 'passed',
      state: 'success',
    })
  })
})
