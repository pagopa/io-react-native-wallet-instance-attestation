import { createSelector, createSlice } from "@reduxjs/toolkit";
import { persistReducer, type PersistConfig } from "redux-persist";
import {
  getCredentialThunk,
  type GetCredentialStatusAttestationThunkOutput,
} from "../../thunks/credential";
import type {
  CredentialResult,
  RootState,
  SupportedCredentialsWithoutPid,
  AsyncStatus,
} from "../types";
import { asyncStatusInitial } from "../utils";
import { sessionReset } from "./sesssion";
import { instanceReset } from "./instance";
import { createSecureStorage } from "../storage";

/**
 * State type definition for the credential slice.
 * It contains:
 * - credentials: the obtained credentials which are persisted, except for the PID which is stored in the PID slice {@link pidSlice}
 * - credentialsState: the state of the async operation to get each credential
 * - statusAttestation: the status attestation for the credentials
 * - statusAttAsyncStatus: the state of the async operation to get each credential status attestation
 */
type CredentialState = {
  credentials: Record<
    SupportedCredentialsWithoutPid,
    CredentialResult | undefined
  >;
  credentialsAsyncStatus: Record<SupportedCredentialsWithoutPid, AsyncStatus>;
  statusAttestation: Record<
    SupportedCredentialsWithoutPid,
    GetCredentialStatusAttestationThunkOutput | undefined
  >;
  statusAttAsyncStatus: Record<SupportedCredentialsWithoutPid, AsyncStatus>;
};

// Initial state for the credential slice
const initialState: CredentialState = {
  credentials: {
    "org.iso.18013.5.1.mDL": undefined,
    EuropeanDisabilityCard: undefined,
    EuropeanHealthInsuranceCard: undefined,
  },
  credentialsAsyncStatus: {
    "org.iso.18013.5.1.mDL": asyncStatusInitial,
    EuropeanDisabilityCard: asyncStatusInitial,
    EuropeanHealthInsuranceCard: asyncStatusInitial,
  },
  statusAttestation: {
    "org.iso.18013.5.1.mDL": undefined,
    EuropeanDisabilityCard: undefined,
    EuropeanHealthInsuranceCard: undefined,
  },
  statusAttAsyncStatus: {
    "org.iso.18013.5.1.mDL": asyncStatusInitial,
    EuropeanDisabilityCard: asyncStatusInitial,
    EuropeanHealthInsuranceCard: asyncStatusInitial,
  },
};

/**
 * Redux slice for the attestion state. It contains the credentials, the credential async operation state, the CiE L3 flow params,
 * the status attestation of the credentials and the status attestation async operation state.
 */
const credentialSlice = createSlice({
  name: "credential",
  initialState,
  reducers: {
    credentialReset: () => initialState,
  },
  extraReducers: (builder) => {
    /**
     * Credential Thunk
     */

    /*
     * Dispatched when a get credential async thunk resolves.
     * Sets the obtained credential and its state to isDone
     * for the requested credential.
     */
    builder.addCase(getCredentialThunk.fulfilled, (state, action) => {
      const credentialType = action.payload.credentialType;
      // Set the credential
      state.credentials[credentialType] = action.payload;
      // Set the status
      state.credentialsAsyncStatus[credentialType] = {
        ...asyncStatusInitial,
        isDone: true,
      };
    });

    /*
     * Dispatched when a get credential async thunk is pending.
     * Sets the credential state to isLoading while resetting isDone and hasError
     * for the requested credential.
     */
    builder.addCase(getCredentialThunk.pending, (state, action) => {
      const credentialType = action.meta.arg.credentialType;
      state.credentialsAsyncStatus[credentialType] = {
        ...asyncStatusInitial,
        isLoading: true,
      };
    });

    /*
     * Dispatched when a get credential async thunk rejected.
     * Sets the credential state to hasError while resetting isLoading and hasError
     * for the requested credential.
     */
    builder.addCase(getCredentialThunk.rejected, (state, action) => {
      const credentialType = action.meta.arg.credentialType;
      state.credentialsAsyncStatus[credentialType] = {
        ...asyncStatusInitial,
        hasError: { status: true, error: action.error },
      };
    });

    // Reset the credential state when the instance is reset.
    builder.addCase(instanceReset, () => initialState);

    // Reset the credential state when the session is reset.
    builder.addCase(sessionReset, () => initialState);
  },
});

/**
 * Exports the actions for the credential slice.
 */
export const { credentialReset } = credentialSlice.actions;

/**
 * Persist configuration for the credential slice.
 * We only persist the obtained credentials.
 */
const persistConfig: PersistConfig<CredentialState> = {
  key: "credential",
  storage: createSecureStorage(),
  whitelist: ["credentials"],
};

/**
 * Persisted reducer for the credential slice.
 */
export const credentialReducer = persistReducer(
  persistConfig,
  credentialSlice.reducer
);

/**
 * Selects a credential from the credential state.
 * @param credentialType - The type of the credential to select
 * @returns the selected credential as {@link CredentialResult}
 */
export const selectCredential =
  (credentialType: SupportedCredentialsWithoutPid) => (state: RootState) =>
    state.credential.credentials[credentialType];

export const selectCredentials = (state: RootState) =>
  state.credential.credentials;

export const selectObtainedCredentials = createSelector(
  selectCredentials,
  (credentials): Array<CredentialResult> =>
    Object.values(credentials).filter(
      (cred) => cred !== undefined
    ) as Array<CredentialResult>
);

/**
 * Selects the state of the async operation of a given credential.
 * @param credentialType - The type of the credential to select the state
 * @returns the state of the async operation for the requested credential as {@link AsyncStatus}
 */
export const selectCredentialAsyncStatus =
  (credentialType: SupportedCredentialsWithoutPid) => (state: RootState) =>
    state.credential.credentialsAsyncStatus[credentialType];

/**
 * Selects the status attestation of a given credential.
 * @param credentialType - The type of the credential to select the status attestation
 * @returns the status attestation for the requested credential
 */
export const selectStatusAttestation =
  (credentialType: SupportedCredentialsWithoutPid) => (state: RootState) =>
    state.credential.statusAttestation[credentialType];

/**
 * Selects the state of the status attestation async operation of a given credential.
 * @param credentialType - The type of the credential to select the state
 * @returns the state of the async operation for the requested credential as {@link AsyncStatus}
 */
export const selectStatusAttestationAsyncStatus =
  (credentialType: SupportedCredentialsWithoutPid) => (state: RootState) =>
    state.credential.statusAttAsyncStatus[credentialType];
