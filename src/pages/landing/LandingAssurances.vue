<script lang="ts" setup>
/**
 * Controls, stated plainly. These describe mechanisms that exist in the system,
 * not aspirations — every one of them is enforced somewhere in the codebase.
 */
const assurances = [
  {
    icon: 'mdi-barcode-scan',
    title: 'Batch and expiry tracked',
    body: 'Every unit is held against its batch number and expiry date, from receipt through to dispensing.',
  },
  {
    icon: 'mdi-book-open-variant',
    title: 'Double-entry ledger',
    body: 'Every peso that moves posts a balanced journal entry. Reports are produced from the ledger, never from operational tables.',
  },
  {
    icon: 'mdi-file-document-check-outline',
    title: 'Documented and reversible',
    body: 'Documents are numbered, printed and retained. Corrections are made by reversal, never by quietly editing a posted record.',
  },
  {
    icon: 'mdi-account-key-outline',
    title: 'Role-controlled access',
    body: 'Staff see only the pages their role permits, and every approval is attributable to a named person.',
  },
]
</script>

<template>
  <section class="section section-alt">
    <v-container>
      <v-row>
        <v-col cols="12" md="4">
          <div class="section-eyebrow mb-3">How We Operate</div>
                              <h2 class="section-title section-title-display mb-4">Accountable by <em class="section-title-accent">design</em></h2>
          <p class="section-lead">
            Regulated buyers audit their suppliers. Everything below is a control we
            run day to day, not a claim about intent.
          </p>
        </v-col>

        <v-col cols="12" md="8">
          <v-row>
            <v-col
              v-for="item in assurances"
              :key="item.title"
              cols="12"
              sm="6"
            >
              <div class="assurance pa-6 h-100">
                <v-icon :icon="item.icon" color="primary" size="26" class="mb-4" />
                <h3 class="assurance-title mb-2">{{ item.title }}</h3>
                <p class="assurance-body">{{ item.body }}</p>
              </div>
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>