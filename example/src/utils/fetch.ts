import { WALLET_PROVIDER_AUTH_TOKEN } from "@env";

const authToken = WALLET_PROVIDER_AUTH_TOKEN;

function addAuthToken(options: RequestInit) {
  const update = { ...options };
  if (authToken) {
    update.headers = {
      ...update.headers,
      Authorization: `Bearer ${authToken}`,
    };
  }
  return update;
}

export default function appFetch(url: RequestInfo, options: RequestInit) {
  return fetch(url, addAuthToken(options));
}
