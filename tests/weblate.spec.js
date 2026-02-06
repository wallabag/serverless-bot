import fetchMock from '@fetch-mock/vitest'
import { WeblateHandler } from '../functions/classes/WeblateHandler.js'
import { handler } from '../functions/weblate.js'

describe('Validating GitHub event', () => {
  test('bad event body', async () => {
    const response = await handler({ body: '{}' })

    expect(response).toEqual({
      body: 'Event is not a Pull Request',
      statusCode: 500,
    })
  })

  test('hook event does not include PR', async () => {
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

    const response = await handler({ body: JSON.stringify(githubEvent) })

    expect(response).toEqual({
      body: 'This webhook needs the "pull_request" event. Please tick it.',
      statusCode: 500,
    })
  })

  test('hook event is ok', async () => {
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

    const response = await handler({ body: JSON.stringify(githubEvent) })

    expect(response).toEqual({
      body: 'Hello diego, the webhook is now enabled for 20minutes/serverless-github-check, enjoy!',
      statusCode: 200,
    })
  })

  test('hook event for an organization is ok', async () => {
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

    const response = await handler({ body: JSON.stringify(githubEvent) })

    expect(response).toEqual({
      body: 'Hello diego, the webhook is now enabled for the organization 20minutes, enjoy!',
      statusCode: 200,
    })
  })
})

describe('Apply label', () => {
  test('PR is NOT ok', async () => {
    const githubEvent = {
      pull_request: {
        user: {
          login: 'j0k3r',
        },
        number: 42,
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
      sender: {
        login: 'j0k3r',
      },
    }

    const response = await handler({ body: JSON.stringify(githubEvent) })

    expect(response).toEqual({
      body: 'PR is not from Weblate',
      statusCode: 204,
    })
  })

  test('PR is ok', async () => {
    fetchMock.mockGlobal().route('*', 200)

    const githubEvent = {
      pull_request: {
        user: {
          login: 'weblate',
        },
        number: 42,
      },
      repository: {
        name: 'bar',
        full_name: 'foo/bar',
        owner: {
          login: 'foo',
        },
      },
      sender: {
        login: 'weblate',
      },
    }

    const weblate = new WeblateHandler('GH_TOKEN')
    const response = await weblate.handle(githubEvent)

    expect(response).toEqual({
      body: 'Process finished',
      statusCode: 204,
    })

    expect(fetch).toHaveFetched('https://api.github.com/repos/foo/bar/issues/42/labels', {
      body: { labels: ['Translations'] },
    })
  })
})
