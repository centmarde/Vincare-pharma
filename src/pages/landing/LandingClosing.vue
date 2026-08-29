<script lang="ts" setup>
import { companyProfiles } from '@/utils/companyProfiles'

const exelmed = companyProfiles.exelmed
</script>

<template>
  <section class="closing">
    <v-container class="py-14">
      <v-row align="center">
        <v-col cols="12" md="8">
          <h2 class="closing-title mb-3">Supplying institutions that cannot run short.</h2>
          <p class="closing-body mb-0">
            {{ exelmed.line1 }} &middot; {{ exelmed.line2 }}
          </p>
        </v-col>
        <v-col cols="12" md="4" class="d-flex justify-md-end mt-6 mt-md-0">
          <v-btn
            class="text-none px-8"
            color="white"
            size="large"
            variant="flat"
            to="/auth"
          >
            Partner Sign In
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>