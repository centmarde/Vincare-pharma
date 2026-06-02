<template>
  <v-card-title class="text-h5 text-center py-6"> Create Account </v-card-title>

  <v-card-text class="px-6 pb-6">
    <v-form ref="formRef" v-model="formValid" @submit.prevent="handleRegister">
      <v-container class="pa-0">
        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
              v-model="registerForm.username"
              label="Username"
              variant="outlined"
              density="comfortable"
              :rules="[requiredValidator, usernameValidator]"
              :error-messages="errors.username"
              prepend-inner-icon="mdi-account"
              class="mb-4"
              hint="3-20 characters, letters, numbers, dots, hyphens, underscores"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
              v-model="registerForm.email"
              label="Email"
              type="email"
              variant="outlined"
              density="comfortable"
              :rules="[requiredValidator, emailValidator]"
              :error-messages="errors.email"
              prepend-inner-icon="mdi-email"
              class="mb-4"
            />
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12">
            <v-select
              v-model="registerForm.role"
              label="Role"
              variant="outlined"
              density="comfortable"
              :items="roleOptions"
              :rules="[requiredValidator]"
              :error-messages="errors.role"
              prepend-inner-icon="mdi-account-group"
              class="mb-4"
              hint="Select your role in the organization"
              persistent-hint
              :loading="rolesStore.loading"
              :disabled="rolesStore.loading"
            />
          </v-col>
        </v-row>



        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
              v-model="registerForm.password"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :rules="[requiredValidator, passwordValidator]"
              :error-messages="errors.password"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append-inner="showPassword = !showPassword"
              class="mb-4"
              hint="At least 8 characters with uppercase, lowercase, number, and special character"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
              v-model="registerForm.confirmPassword"
              label="Confirm Password"
              :type="showConfirmPassword ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :rules="[
                  requiredValidator,
                  (v) => confirmedValidator(v, registerForm.password)
                ]"
              :error-messages="errors.confirmPassword"
              prepend-inner-icon="mdi-lock-check"
              :append-inner-icon="
                showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'
              "
              @click:append-inner="showConfirmPassword = !showConfirmPassword"
              class="mb-6"
            />
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12">
            <v-btn
              type="submit"
              color="on-primary"
              variant="elevated"
              size="large"
              block
              :loading="isLoading"
              :disabled="!formValid || isLoading"
              class="mb-4"
            >
              Create Account
            </v-btn>
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12" class="text-center">
            <span class="text-body-2 text-medium-emphasis">
              Already have an account?
            </span>
            <v-btn
              variant="text"
              color="light"
              size="small"
              class="ml-1"
              @click="$emit('switch-to-login')"
            >
              Sign In
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-form>
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import {
  requiredValidator,
  emailValidator,
  passwordValidator,
  usernameValidator,
  confirmedValidator,
  getErrorMessage,
} from "@/lib/validator";
import { useAuthUserStore } from "@/stores/authUser";
import { useUserRolesStore } from "@/stores/roles";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";

// Emits
const emit = defineEmits<{
  "switch-to-login": [];
}>();

// Composables
const authStore = useAuthUserStore();
const rolesStore = useUserRolesStore();
const toast = useToast();
const router = useRouter();

// Form refs and reactive data
const formRef = ref();
const formValid = ref(false);
const loading = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

// Computed
const isLoading = computed(() => loading.value || authStore.loading);

// Form data
const registerForm = reactive({
  username: "",
  email: "",
  role: undefined as number | undefined,
  password: "",
  confirmPassword: "",
});

// Computed properties for role options
const roleOptions = computed(() => {
  return rolesStore.roles.map(role => ({
    title: role.title || 'Untitled Role',
    value: role.id
  }));
});

// Error handling
const errors = reactive({
  username: "",
  email: "",
  role: "",
  password: "",
  confirmPassword: "",
});

// Methods
const clearErrors = () => {
  errors.username = "";
  errors.email = "";
  errors.role = "";
  errors.password = "";
  errors.confirmPassword = "";
};

const handleRegister = async () => {
  if (!formValid.value) {
    toast.error("Please fill in all required fields correctly");
    return;
  }

  if (!registerForm.role) {
    toast.error("Please select a role");
    return;
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    toast.error("Passwords do not match");
    return;
  }

  loading.value = true;
  clearErrors();

  try {
    const result = await authStore.registerUser(
      registerForm.email,
      registerForm.password,
      registerForm.username,
      registerForm.role,

    );

    if (result.error) {
      const errorMessage = getErrorMessage(result.error);
      toast.error(errorMessage || "Registration failed");

      // Handle specific error types
      if (errorMessage.toLowerCase().includes("email")) {
        errors.email = errorMessage;
      } else if (errorMessage.toLowerCase().includes("username")) {
        errors.username = errorMessage;
      } else if (errorMessage.toLowerCase().includes("password")) {
        errors.password = errorMessage;
      } else if (errorMessage.toLowerCase().includes("role")) {
        errors.role = errorMessage;
      }
    } else {
      toast.success(
        "Account created successfully! Please check your email to verify your account."
      );
      resetForm();
      // Switch back to login form after successful registration
      emit('switch-to-login');
    }
  } catch (error: any) {
    toast.error(error.message || "An unexpected error occurred");
  } finally {
    loading.value = false;
  }
};

// Reset form
const resetForm = () => {
  registerForm.username = "";
  registerForm.email = "";
  registerForm.role = undefined;
  registerForm.password = "";
  registerForm.confirmPassword = "";
  clearErrors();
  formRef.value?.resetValidation();
};

// Load roles on component mount
onMounted(async () => {
  await rolesStore.fetchRoles();
});

// Expose methods for parent component
defineExpose({
  resetForm,
});
</script>
