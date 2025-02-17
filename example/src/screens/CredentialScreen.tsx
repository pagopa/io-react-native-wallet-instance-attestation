import React, { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../store/utils";
import {
  selectCredential,
  selectCredentialAsyncStatus,
} from "../store/reducers/credential";
import { getCredentialThunk } from "../thunks/credential";
import TestScenario, {
  type TestScenarioProp,
} from "../components/TestScenario";
import { IOVisualCostants, VSpacer } from "@pagopa/io-app-design-system";
import { FlatList } from "react-native";
import { useDebugInfo } from "../hooks/useDebugInfo";

/**
 * Component (screen in a future PR) to test the credential functionalities.
 * This includes issuing a credential and getting its status attestation.
 */
export const CredentialScreen = () => {
  const dispatch = useAppDispatch();

  const mdlState = useAppSelector(
    selectCredentialAsyncStatus("org.iso.18013.5.1.mDL")
  );
  const mdl = useAppSelector(selectCredential("org.iso.18013.5.1.mDL"));

  const dcState = useAppSelector(
    selectCredentialAsyncStatus("EuropeanDisabilityCard")
  );
  const dc = useAppSelector(selectCredential("EuropeanDisabilityCard"));

  const tsState = useAppSelector(
    selectCredentialAsyncStatus("EuropeanHealthInsuranceCard")
  );
  const ts = useAppSelector(selectCredential("EuropeanHealthInsuranceCard"));

  useDebugInfo({
    mdlState,
    mdl,
    dcState,
    dc,
    tsState,
    ts,
  });

  const scenarios: Array<TestScenarioProp> = useMemo(
    () => [
      {
        title: "Get credential (MDL)",
        onPress: () =>
          dispatch(
            getCredentialThunk({ credentialType: "org.iso.18013.5.1.mDL" })
          ),
        isLoading: mdlState.isLoading,
        hasError: mdlState.hasError,
        isDone: mdlState.isDone,
        icon: "car",
        isPresent: !!mdl,
      },
      {
        title: "Get credential (DC)",
        onPress: () =>
          dispatch(
            getCredentialThunk({ credentialType: "EuropeanDisabilityCard" })
          ),
        isLoading: dcState.isLoading,
        hasError: dcState.hasError,
        isDone: dcState.isDone,
        icon: "accessibility",
        isPresent: !!dc,
      },
      {
        title: "Get credential (TS)",
        onPress: () =>
          dispatch(
            getCredentialThunk({
              credentialType: "EuropeanHealthInsuranceCard",
            })
          ),
        isLoading: tsState.isLoading,
        hasError: tsState.hasError,
        isDone: tsState.isDone,
        icon: "healthCard",
        isPresent: !!ts,
      },
    ],
    [
      dc,
      dcState.hasError,
      dcState.isDone,
      dcState.isLoading,
      dispatch,
      mdl,
      mdlState.hasError,
      mdlState.isDone,
      mdlState.isLoading,
      ts,
      tsState.hasError,
      tsState.isDone,
      tsState.isLoading,
    ]
  );

  return (
    <FlatList
      contentContainerStyle={{
        margin: IOVisualCostants.appMarginDefault,
      }}
      data={scenarios}
      keyExtractor={(item, index) => `${item.title}-${index}`}
      renderItem={({ item }) => (
        <>
          <TestScenario
            onPress={item.onPress}
            title={item.title}
            isLoading={item.isLoading}
            hasError={item.hasError}
            isDone={item.isDone}
            icon={item.icon}
            isPresent={item.isPresent}
          />
          <VSpacer />
        </>
      )}
    />
  );
};
