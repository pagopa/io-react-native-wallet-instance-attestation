/* eslint-disable react-native/no-inline-styles */
import {
  IOVisualCostants,
  ModuleSummary,
  VSpacer,
} from "@pagopa/io-app-design-system";
import { useNavigation } from "@react-navigation/native";
import type { ComponentProps } from "react";
import React, { useMemo } from "react";
import { Alert, FlatList, SafeAreaView } from "react-native";
import { useDebugInfo } from "../hooks/useDebugInfo";
import { selectHasInstanceKeyTag } from "../store/reducers/instance";

import { useAppSelector } from "../store/utils";
import { selectSesssionId } from "../store/reducers/sesssion";
import { selectPid } from "../store/reducers/pid";

type ModuleSummaryProps = ComponentProps<typeof ModuleSummary>;

/**
 * Home screen component which contains different sections to test the SDK functionalities.
 * This includes interacting with the wallet instance provider, issuing a PID and a credential, get their status attestation and more.
 */
const HomeScreen = () => {
  const navigation = useNavigation();
  const hasIntegrityKeyTag = useAppSelector(selectHasInstanceKeyTag);
  const session = useAppSelector(selectSesssionId);
  const pid = useAppSelector(selectPid);

  useDebugInfo({
    session,
  });

  const sections: Array<ModuleSummaryProps> = useMemo(
    () => [
      {
        label: "Wallet Instance & Attestation",
        description: "Register a wallet instance and obtain an attestation",
        icon: "chevronRight",
        onPress: () => navigation.navigate("WalletInstance"),
      },
      {
        label: "PID",
        description: "Obtain a PID",
        icon: "chevronRight",
        onPress: () =>
          hasIntegrityKeyTag
            ? navigation.navigate("Pid")
            : Alert.alert("Create a wallet instance first"),
      },
      {
        label: "Credentials",
        description: "Obtain a credential with PID authentication",
        icon: "chevronRight",
        onPress: () =>
          pid && hasIntegrityKeyTag
            ? navigation.navigate("Credentials")
            : Alert.alert("Register a wallet instance and obtain a PID first"),
      },
      // {
      //   label: "Status Attestation",
      //   description: "Obtain the status attestation of a credential",
      //   icon: "chevronRight",
      //   onPress: () =>
      //     credentials.MDL
      //       ? navigation.navigate("StatusAttestation")
      //       : Alert.alert("Obtain a MDL first"),
      // },
      {
        label: "Settings",
        description: "Change the environment and logout",
        icon: "chevronRight",
        onPress: () => navigation.navigate("Settings"),
      },
      {
        label: "Presentations",
        description: "Present credential",
        icon: "chevronRight",
        onPress: () =>
          pid
            ? navigation.navigate("Presentations")
            : Alert.alert("Obtain a PID first"),
      },
    ],
    [hasIntegrityKeyTag, navigation, pid]
  );

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{
          margin: IOVisualCostants.appMarginDefault,
        }}
        data={sections}
        keyExtractor={(item, index) => `${item.label}-${index}`}
        renderItem={({ item }) => (
          <>
            <ModuleSummary
              label={item.label}
              description={item.description}
              icon={item.icon}
              onPress={item.onPress}
            />
            <VSpacer />
          </>
        )}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;
