import { startFlowFromQR, type StartFlow } from "./01-start-flow";
import {
  evaluateRelyingPartyTrust,
  type EvaluateRelyingPartyTrust,
} from "./02-evaluate-rp-trust";
import {
  getRequestObject,
  type GetRequestObject,
} from "./03-get-request-object";
import {
  fetchJwksFromRequestObject,
  fetchJwksFromConfig,
  type FetchJwks,
} from "./04-retrieve-rp-jwks";
import {
  verifyRequestObjectSignature,
  type VerifyRequestObjectSignature,
} from "./05-verify-request-object";
import {
  fetchPresentDefinition,
  type FetchPresentationDefinition,
} from "./06-fetch-presentation-definition";
import {
  evaluateInputDescriptorForSdJwt4VC,
  type EvaluateInputDescriptorSdJwt4VC,
} from "./07-evaluate-input-descriptor";
import {
  sendAuthorizationResponse,
  type SendAuthorizationResponse,
} from "./08-send-authorization-response";
import * as Errors from "./errors";

export {
  startFlowFromQR,
  evaluateRelyingPartyTrust,
  getRequestObject,
  fetchJwksFromRequestObject,
  fetchJwksFromConfig,
  verifyRequestObjectSignature,
  fetchPresentDefinition,
  evaluateInputDescriptorForSdJwt4VC,
  sendAuthorizationResponse,
  Errors,
};
export type {
  StartFlow,
  EvaluateRelyingPartyTrust,
  GetRequestObject,
  FetchJwks,
  VerifyRequestObjectSignature,
  FetchPresentationDefinition,
  EvaluateInputDescriptorSdJwt4VC,
  SendAuthorizationResponse,
};
