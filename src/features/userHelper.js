import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Dialog, List, Portal, TextInput } from "react-native-paper";
import { object, ref, string } from "yup";
import { FORM_PLACEHOLDER } from "../theme/formColors";

export const gstSignupInitialValues = {
  surname: "",
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  phoneNumber: "",
  serviceProvider: "",
};

export const gstSignupValidationSchema = object().shape({
  surname: string().trim().required("Surname is required"),

  name: string().trim().required("Name is required"),

  email: string().email("Invalid email address").required("Email is required"),

  password: string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),

  confirmPassword: string()
    .oneOf([ref("password")], "Passwords do not match")
    .required("Confirm your password"),

  phoneNumber: string().trim().required("Phone number is required"),

  serviceProvider: object().nullable().required("Service Provider is required"),
});

export const userSigninValidationSchema = object().shape({
  email: string().email("Invalid email address").required("Email is required"),

  password: string().required("Password is required"),
});

/* =====================================================
  SERCIVE PROVIDER SELECT
===================================================== */

const ServiceProviderSelect = ({ value, options, onSelect, disabled }) => {
  const [visible, setVisible] = useState(false);

  return (
    <View>
      {/* Field */}
      <Pressable
        onPress={() => !disabled && setVisible(true)}
        style={{ backgroundColor: "yellow" }}
      >
        <View style={{ position: "relative", marginBottom: 0 }}>
          {/* <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderWidth: 0.1,
              // borderColor: "black",
              backgroundColor: "white",
              borderRadius: 3,
              marginBottom: 4,
              position: "absolute",
              top: -10,
              left: 10,
              zIndex: 100,
            }}
          >
            <Text style={{ fontSize: 12, color: "black" }}>
              Service Provider
            </Text>
          </View> */}
          <TextInput
            mode="outlined"
            value={value?.name || ""}
            editable={false}
            style={{ backgroundColor: "lightgrey" }}
            contentStyle={{ fontSize: 13 }}
            textColor="black"
            right={<TextInput.Icon icon="chevron-down" />}
            outlineColor="transparent" // 👈 remove border
            activeOutlineColor="transparent" // 👈 remove border when focused
            placeholder="Select service provider"
            placeholderTextColor={FORM_PLACEHOLDER}
          />
        </View>
      </Pressable>

      {/* Dialog */}
      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>Select Service Provider</Dialog.Title>

          <Dialog.ScrollArea style={{ maxHeight: 300 }}>
            {options.map((sp) => (
              <List.Item
                key={sp.id}
                title={sp.name}
                onPress={() => {
                  onSelect(sp);
                  setVisible(false);
                }}
              />
            ))}
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

export default ServiceProviderSelect;
