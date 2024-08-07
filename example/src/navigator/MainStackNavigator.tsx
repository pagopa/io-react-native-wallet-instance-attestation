import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { selectIoAuthToken } from "../store/reducers/sesssion";
import { useSelector } from "react-redux";
import HomeScreen from "../screens/HomeScreen";
import LoginScreen from "../screens/LoginScreen";

const Stack = createNativeStackNavigator();

export const MainStackNavigator = () => {
  const ioAuthToken = useSelector(selectIoAuthToken);
  return (
    <Stack.Navigator id="MainStackNavigator">
      {ioAuthToken ? (
        /*
         * Protected routes via the ioAuthToken
         */
        <Stack.Screen name="Home" component={HomeScreen} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
};
