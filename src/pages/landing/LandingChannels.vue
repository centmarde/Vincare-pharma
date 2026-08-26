<script lang="ts" setup>
/**
 * The three channels the business actually trades through — the same split the
 * system is built around (In-House / Ethical / Retail), not invented segments.
 */
const channels = [
  {
    icon: 'mdi-stethoscope',
    eyebrow: 'Institutional',
    title: 'Government & LGU Supply',
    body: 'Supply against agency purchase requests and purchase orders, with delivery receipts, statements of account and payment terms handled end to end.',
    points: ['Purchase request to delivery receipt', 'Statements of account and aging', 'Terms-based settlement'],
  },
  {
    icon: 'mdi-sitemap-outline',
    eyebrow: 'Professional',
    title: 'Ethical & Clinic Accounts',
    body: 'Direct supply to private clinics, hospitals and practitioners through assigned field representatives, on agreed credit terms.',
    points: ['Assigned account representatives', 'Agreed discount and rebate terms', 'Scheduled collections'],
  },
  {
    icon: 'mdi-package-variant-closed',
    eyebrow: 'Retail',
    title: 'Pharmacy Counter',
    body: 'Over-the-counter dispensing through Exelmed Pharma Trade, on the same stock and pricing controls as the institutional channels.',
    points: ['Batch and expiry controlled', 'Branch-level stock', 'Daily cash reconciliation'],
  },
]
</script>

<template>
  <section id="capabilities" class="section">
    <v-container>
      <div class="section-head section-head-narrow mb-12">
        <h2 class="section-title section-title-display mb-6">
          One supply<br />chain.<br />
          <em class="section-title-accent">Three ways in.</em>
        </h2>
        <p class="section-lead">
          The same stock, the same controls and the same accountability &mdash;
          whether you are a municipal health office, a private clinic or a walk-in
          customer.
        </p>
      </div>

      <v-row>
        <v-col v-for="channel in channels" :key="channel.title" cols="12" md="4">
          <v-card class="channel h-100" flat>
            <v-card-text class="pa-7">
              <div class="d-flex align-center justify-space-between mb-8">
                <div class="channel-icon">
                  <v-icon :icon="channel.icon" size="20" color="primary" />
                </div>
                <div class="channel-eyebrow">{{ channel.eyebrow }}</div>
              </div>

              <h3 class="channel-title mb-4">{{ channel.title }}</h3>
              <p class="channel-body mb-6">{{ channel.body }}</p>

              <v-divider class="mb-5" />

              <div
                v-for="point in channel.points"
                :key="point"
                class="channel-point d-flex align-start mb-3"
              >
                <v-icon
                  icon="mdi-check"
                  size="16"
                  color="primary"
                  class="mt-1 me-3 flex-shrink-0"
                />
                <span>{{ point }}</span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>