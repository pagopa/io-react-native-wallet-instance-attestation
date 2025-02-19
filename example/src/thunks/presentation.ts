import appFetch from "../utils/fetch";
import { createAppAsyncThunk } from "./utils";
import { Credential } from "@pagopa/io-react-native-wallet";
import {
  selectAttestation,
  shouldRequestAttestationSelector,
} from "../store/reducers/attestation";
import { selectPid } from "../store/reducers/pid";
// import { selectCredentials } from "../store/reducers/credential";
import { getAttestationThunk } from "./attestation";
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
    await Credential.Presentation.getRequestObject(requestUri, {
      appFetch,
    });

  const jwks = await Credential.Presentation.fetchJwksFromRequestObject(
    requestObjectEncodedJwt,
    {
      context: { appFetch },
    }
  );

  const { requestObject } =
    await Credential.Presentation.verifyRequestObjectSignature(
      requestObjectEncodedJwt,
      jwks.keys
    );

  const { presentationDefinition } =
    await Credential.Presentation.fetchPresentDefinition(requestObject, {
      appFetch: appFetch,
    });

  const credentialsSdJwt: [string, string][] = [];
  const credentialsMdoc: [string, string][] = [];

  const pid = selectPid(getState());
  if (!pid) {
    throw new Error("PID not found");
  }
  credentialsSdJwt.push([pid.keyTag, pid.credential]);

  // const credentials = selectCredentials(getState());
  // const mDL = credentials["org.iso.18013.5.1.mDL"];
  // if (mDL?.credential) {
  //   credentialsMdoc.push([mDL.keyTag, mDL.credential]);
  // }

  const evaluateInputDescriptors =
    await Credential.Presentation.evaluateInputDescriptors(
      presentationDefinition.input_descriptors,
      credentialsSdJwt,
      credentialsMdoc
    );

  const credentialAndInputDescriptor = evaluateInputDescriptors.map(
    (evaluateInputDescriptor) => {
      // Present only the mandatory claims
      const requestedClaims = [
        ...evaluateInputDescriptor.evaluatedDisclosure.requiredDisclosures.map(
          (item) => item.decoded[1]
        ),
      ];
      return {
        requestedClaims,
        inputDescriptor: evaluateInputDescriptor.inputDescriptor,
        credential: evaluateInputDescriptor.credential,
        keyTag: evaluateInputDescriptor.keyTag,
      };
    }
  );

  const remotePresentations =
    await Credential.Presentation.prepareRemotePresentations(
      credentialAndInputDescriptor,
      requestObject.nonce,
      requestObject.client_id
    );

  const authResponse =
    args.allowed === "acceptanceState"
      ? await Credential.Presentation.sendAuthorizationResponse(
          requestObject,
          presentationDefinition.id,
          jwks.keys,
          remotePresentations,
          { appFetch: appFetch }
        )
      : await Credential.Presentation.sendAuthorizationErrorResponse(
          requestObject,
          "access_denied",
          jwks.keys,
          { appFetch: appFetch }
        );

  return { result: authResponse };
});
