# Serverless SiteConfig GitHub Check

[![serverless](http://public.serverless.com/badges/v3.svg)](https://serverless.com/)
[![Build Status](https://travis-ci.org/wallabag/serverless-site-config-github-check.svg?branch=master)](https://travis-ci.org/wallabag/serverless-site-config-github-check)

This serverless project validates PRs sent to site-config repository: [fivefilters](https://github.com/fivefilters/ftr-site-config) & [graby](https://github.com/j0k3r/graby-site-config).

## Use Cases

Available lambdas:

- **extension**: It validates each file in the diff has a `.txt` extension.

## Prerequisites

- Node.js 8.10
- Serverless CLI v1.35.1 or later (`npm install -g serverless`)
- An AWS account
- Defined [provider credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials/)

## Setup

### Deploy the code

- Get a [new personal access token](https://github.com/settings/tokens/new) on GitHub
- Set it in [AWS Parameter Store](https://eu-west-1.console.aws.amazon.com/systems-manager/parameters/create?region=eu-west-1) as a `SecureString` with name `GITHUB_TOKEN`
- Deploy the service using: `serverless deploy`

By default

- it'll use the AWS profile `default`, but you can use your own using (be sure it's defined in your `~/.aws/credentials`): `serverless deploy --aws-profile myprofile`
- it'll be deployed to the AWS region `eu-west-1` but you can change it using: `serverless deploy --region us-east-1`

### Setup GitHub webhook

Configure the webhook in [the GitHub repository settings](https://developer.github.com/webhooks/creating/#setting-up-a-webhook).

- In the Payload URL, enter the URL you received after deploying. It would be something like `https://<your_url>.amazonaws.com/dev/webhook`.
- Choose the "application/json" in Content type.
- In the types of events to trigger the webhook, select "Let me select individual events", then select at least `Pull Requests`.

### Some options

You can update some options from the `serverless.yml` file:

- `NAMESPACE`: change the namespace used in the PR check (displayed at the bottom of each PR)

## Info

Inspired from [20minutes/serverless-github-check](https://github.com/20minutes/serverless-github-check).
