const got = require('got')
const queryString = require('query-string')
const augmentGenerator = require('./lib/augmentGenerator')
const FormData = require('form-data')
const fs = require('fs')

function removeToken (err) {
  delete err.gotOptions
  delete err.response
  return err
}

function getNextUrl (linkHeader) {
  const next = linkHeader.split(',').find(l => l.search(/rel="next"$/) !== -1)

  const url = next && next.match(/<(.*?)>/)
  return url && url[1]
}

module.exports = (apiUrl, apiKey, options = {}) => {
  const log = options.log || (() => {})

  const canvasGot = got.extend({
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    json: true
  })

  async function requestUrl (endpoint, method = 'GET', body = {}, options = {}) {
    log(`Request ${method} ${endpoint}`)

    try {
      const result = await canvasGot({
        baseUrl: apiUrl,
        body: body,
        url: endpoint,
        method,
        ...options
      })

      log(`Response from ${method} ${endpoint}`)
      return result
    } catch (err) {
      throw removeToken(err)
    }
  }

  async function get (endpoint, queryParams = {}) {
    return canvasGot({
      url: endpoint,
      baseUrl: apiUrl,
      method: 'GET',
      query: queryString.stringify(queryParams, { arrayFormat: 'bracket' })
    })
  }

  async function * list (endpoint, queryParams = {}) {
    for await (let page of listPaginated(endpoint, queryParams)) {
      log(`Traversing a page...`)

      for (let element of page) {
        yield element
      }
    }
  }

  async function * listPaginated (endpoint, queryParams = {}) {
    try {
      let query = queryString.stringify(queryParams, { arrayFormat: 'bracket' })
      let first = await canvasGot.get({
        query,
        url: endpoint,
        baseUrl: apiUrl
      })

      yield first.body
      let url = first.headers && first.headers.link && getNextUrl(first.headers.link)

      while (url) {
        log(`Request GET ${url}`)

        const response = await canvasGot.get({ url })

        log(`Response from GET ${url}`)
        yield response.body
        url = response.headers && response.headers.link && getNextUrl(response.headers.link)
      }
    } catch (err) {
      throw removeToken(err)
    }
  }

  async function sendSis (endpoint, attachment, body = {}) {
    const form = new FormData()

    for (const key in body) {
      form.append(key, body[key])
    }

    form.append('attachment', fs.createReadStream(attachment))

    return got
      .post({
        url: endpoint,
        baseUrl: apiUrl,
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form
      })
      .then(response => {
        response.body = JSON.parse(response.body)
        return response
      })
  }

  return {
    requestUrl,
    get,
    list: augmentGenerator(list),
    listPaginated: augmentGenerator(listPaginated),
    sendSis
  }
}
