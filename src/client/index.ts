import { WalletProviderResponseError } from "../utils/errors";
import {
  ProblemDetail,
  createApiClient as createWalletProviderApiClient,
} from "./generated/wallet-provider";
import { ApiClient as WalletProviderApiClient } from "./generated/wallet-provider";

export type WalletProviderClient = WalletProviderApiClient;

const validateResponse = async (response: Response) => {
  if (!response.ok) {
    let problemDetail: ProblemDetail = {};
    try {
      problemDetail = ProblemDetail.parse(await response.json());
    } catch {
      problemDetail = {
        title: "Invalid response from Wallet Provider",
      };
    }

    let statusResponse = `Response status code: ${response.status}`;

    throw new WalletProviderResponseError(
      problemDetail.title
        ? problemDetail.title
        : "Invalid response from Wallet Provider",
      problemDetail.type,
      problemDetail.detail
        ? statusResponse
        : `${statusResponse} with detail: ${problemDetail.detail}`
    );
  }
  return response;
};

export const getWalletProviderClient = (context: {
  walletProviderBaseUrl: string;
  appFetch?: GlobalFetch["fetch"];
}) => {
  const { walletProviderBaseUrl, appFetch = fetch } = context;

  return createWalletProviderApiClient(
    (method, url, params) =>
      appFetch(url, {
        method,
        body: params ? JSON.stringify(params.body) : undefined,
      })
        .then(validateResponse)
        .then((res) => {
          const contentType = res.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            return res.json();
          }
          return res.text();
        }),
    walletProviderBaseUrl
  );
};
