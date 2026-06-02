<template>
  <v-card-title class="text-h5 text-center py-6"> Sign In </v-card-title>

  <v-card-text class="px-6 pb-6">
    <v-form ref="formRef" v-model="formValid" @submit.prevent="handleLogin">
      <v-container class="pa-0">
        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
              v-model="loginForm.email"
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
            <v-text-field
              v-model="loginForm.password"
              :label="passwordLabel"
              :type="showPassword ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :rules="[requiredValidator]"
              :error-messages="errors.password"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append-inner="showPassword = !showPassword"
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
              Sign In
            </v-btn>
          </v-col>
        </v-row>

        <v-row no-gutters>
          <v-col cols="12" class="text-center">
            <span class="text-body-2 text-medium-emphasis">
              Don't have an account?
            </span>
            <v-btn
              variant="text"
              size="small"
              class="ml-1"
              @click="$emit('switch-to-register')"
            >
              Sign Up
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-form>
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import {
  requiredValidator,
  emailValidator,
  getErrorMessage,
} from "@/lib/validator";
import { useAuthUserStore } from "@/stores/authUser";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";

// Emits
defineEmits<{
  "switch-to-register": [];
}>();

// Composables
const authStore = useAuthUserStore();
const toast = useToast();
const router = useRouter();

// Form refs and reactive data
const formRef = ref();
const formValid = ref(false);
const loading = ref(false);
const showPassword = ref(false);

// Form data
const loginForm = reactive({
  email: "",
  password: "",
});

// Error handling
const errors = reactive({
  email: "",
  password: "",
});

// Computed
const isLoading = computed(() => loading.value || authStore.loading);
const passwordLabel = "Password";

// Methods
const clearErrors = () => {
  errors.email = "";
  errors.password = "";
};

const handleLogin = async () => {
  if (!formValid.value) {
    toast.error("Please fill in all required fields correctly");
    return;
  }

  loading.value = true;
  clearErrors();

  try {
    const result = await authStore.signIn(
      loginForm.email,
      loginForm.password
    );

    if (result.error) {
      const errorMessage = getErrorMessage(result.error);
      toast.error(errorMessage || "Login failed");

      // Handle specific error types
      if (errorMessage.toLowerCase().includes("email")) {
        errors.email = errorMessage;
      } else if (errorMessage.toLowerCase().includes("password")) {
        errors.password = errorMessage;
      }
    } else {
      toast.success("Login successful!");
      resetForm();
      router.push("/");
    }
  } catch (error: any) {
    toast.error(error.message || "An unexpected error occurred");
  } finally {
    loading.value = false;
  }
};

// Reset form
const resetForm = () => {
  loginForm.email = "";
  loginForm.password = "";
  clearErrors();
  formRef.value?.resetValidation();
};

// Expose methods for parent component
defineExpose({
  resetForm,
});
</script>
