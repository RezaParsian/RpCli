import {up} from "up-fetch";

const upFetch = up(fetch, () => ({
  baseUrl: 'https://gateway.hashpa.com',
  headers: {
    'Authorization': `Bearer rsk-gLdm2gmnRStRCIFJi54JEDjmI2IPYagJvRZ8hDFiqCcP05rEIIUdLbhLYf0nsj3`
  }
}))

export default async function request(messages) {
  return upFetch('api/v0/chat/completions', {
    method: 'post',
    body: {
      model_id: process.env.DEFAULT_AI_MODEL,
      messages
    }
  })
}