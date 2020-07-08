import { client } from 'octonode'
import { weblate } from '../functions/weblate'

jest.mock('octonode')

describe('Validating GitHub event', () => {
  test('bad event body', async () => {
    const callback = jest.fn()

    await weblate({ body: '{}' }, {}, callback)

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
        events: [
          'issue',
          'push',
        ],
      },
      repository: {
        full_name: '20minutes/serverless-github-check',
      },
      sender: {
        login: 'diego',
      },
    }

    await weblate({ body: JSON.stringify(githubEvent) }, {}, callback)

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
        events: [
          'pull_request',
          'push',
        ],
      },
      repository: {
        full_name: '20minutes/serverless-github-check',
      },
      sender: {
        login: 'diego',
      },
    }

    await weblate({ body: JSON.stringify(githubEvent) }, {}, callback)

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
        events: [
          'pull_request',
          'push',
        ],
      },
      organization: {
        login: '20minutes',
      },
      sender: {
        login: 'diego',
      },
    }

    await weblate({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Hello diego, the webhook is now enabled for the organization 20minutes, enjoy!',
      statusCode: 200,
    })
  })
})

describe('Apply label', () => {
  test('PR is NOT ok', async () => {
    client.mockReturnValue({
      issue: jest.fn((fullName, number) => {
        expect(fullName).toBe('foo/bar')
        expect(number).toBe(42)

        return {
          addLabelsAsync: jest.fn((labels) => {
            expect(labels[0]).toBe('Translations')
          }),
        }
      }),
    })

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        user: {
          login: 'j0k3r',
        },
        number: 42,
      },
      repository: {
        full_name: 'foo/bar',
      },
      sender: {
        login: 'j0k3r',
      },
    }

    await weblate({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'PR is not from Weblate',
      statusCode: 204,
    })
  })
  test('PR is ok', async () => {
    client.mockReturnValue({
      issue: jest.fn((fullName, number) => {
        expect(fullName).toBe('foo/bar')
        expect(number).toBe(42)

        return {
          addLabelsAsync: jest.fn((labels) => {
            expect(labels[0]).toBe('Translations')
          }),
        }
      }),
    })

    const callback = jest.fn()
    const githubEvent = {
      pull_request: {
        user: {
          login: 'weblate',
        },
        number: 42,
      },
      repository: {
        full_name: 'foo/bar',
      },
      sender: {
        login: 'weblate',
      },
    }

    await weblate({ body: JSON.stringify(githubEvent) }, {}, callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(null, {
      body: 'Process finished',
      statusCode: 204,
    })
  })
})
