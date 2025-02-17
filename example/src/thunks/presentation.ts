import { createAppAsyncThunk } from "./utils";
import {
  createCryptoContextFor,
  Credential,
} from "@pagopa/io-react-native-wallet";
import {
  selectAttestation,
  shouldRequestAttestationSelector,
} from "../store/reducers/attestation";
import { selectPid } from "../store/reducers/pid";
import { getAttestationThunk } from "./attestation";
import { SdJwt } from "@pagopa/io-react-native-wallet";
import type { InputDescriptor } from "src/credential/presentation/types";
import type { PresentationStateKeys } from "../store/reducers/presentation";

export type RemoteCrossDevicePresentationThunkInput = {
  qrcode: string;
  allowed: PresentationStateKeys;
};

export type RemoteCrossDevicePresentationThunkOutput = {
  result: Awaited<
    ReturnType<Credential.Presentation.SendAuthorizationResponse>
  >;
};

/**
 * Thunk to present credential.
 */
export const remoteCrossDevicePresentationThunk = createAppAsyncThunk<
  RemoteCrossDevicePresentationThunkOutput,
  RemoteCrossDevicePresentationThunkInput
>("presentation/remote", async (args, { getState, dispatch }) => {
  // Checks if the wallet instance attestation needs to be reuqested
  if (shouldRequestAttestationSelector(getState())) {
    await dispatch(getAttestationThunk());
  }

  // Gets the Wallet Instance Attestation from the persisted store
  const walletInstanceAttestation = selectAttestation(getState());
  if (!walletInstanceAttestation) {
    throw new Error("Wallet Instance Attestation not found");
  }
  const qrcode = args.qrcode;
  const url = new URL(qrcode);
  const request_uri = url.searchParams.get("request_uri");
  const client_id = url.searchParams.get("client_id");
  if (!request_uri || !client_id) {
    throw new Error("Invalid presentation link");
  }

  const { requestUri } = Credential.Presentation.startFlowFromQR(
    request_uri,
    client_id
  );

  const { requestObjectEncodedJwt } =
    await Credential.Presentation.getRequestObject(requestUri);

  const jwks = await Credential.Presentation.fetchJwksFromRequestObject(
    requestObjectEncodedJwt
  );

  const { requestObject } =
    await Credential.Presentation.verifyRequestObjectSignature(
      requestObjectEncodedJwt,
      jwks.keys
    );

  const { presentationDefinition } =
    await Credential.Presentation.fetchPresentDefinition(requestObject);

  // We suppose that request is about PID
  // In this case no check about other credentials
  const pid = selectPid(getState());
  if (!pid) {
    throw new Error("PID not found");
  }
  const pidCredentialJwt = SdJwt.decode(pid.credential);

  // We support only one credential for now, we get first input_descriptor
  const inputDescriptor =
    presentationDefinition.input_descriptors[0] ||
    ({} as unknown as InputDescriptor);

  const { requiredDisclosures } =
    Credential.Presentation.evaluateInputDescriptorForSdJwt4VC(
      inputDescriptor,
      pidCredentialJwt.sdJwt.payload,
      pidCredentialJwt.disclosures
    );

  const disclosuresRequestedClaimName = [
    ...requiredDisclosures.map((item) => item.decoded[1]),
  ];

  const credentialCryptoContext = createCryptoContextFor(pid.keyTag);

  const authResponse =
    args.allowed === "acceptanceState"
      ? await Credential.Presentation.sendAuthorizationResponse(
          requestObject,
          presentationDefinition,
          jwks.keys,
          [
            pid.credential,
            disclosuresRequestedClaimName,
            credentialCryptoContext,
          ]
        )
      : await Credential.Presentation.sendAuthorizationErrorResponse(
          requestObject,
          "access_denied",
          jwks.keys
        );

  return { result: authResponse };
});
