<script lang="ts" setup>
import { groupContact } from '@/utils/companyProfiles'
</script>

<template>
  <section id="contact" class="section">
    <v-container>
      <v-row>
        <v-col cols="12" md="4">
          <div class="section-eyebrow mb-3">Get In Touch</div>
                              <h2 class="section-title section-title-display mb-4">Talk to us about <em class="section-title-accent">supply</em></h2>
          <p class="section-lead">
            For procurement enquiries, price quotations and account applications.
          </p>
        </v-col>

        <v-col cols="12" md="8">
          <v-row>
            <v-col cols="12" sm="6">
              <div class="contact-label">Office</div>
              <div class="contact-value">{{ groupContact.address }}</div>
              <div class="contact-value">{{ groupContact.region }}</div>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="contact-label">Landline</div>
              <a class="contact-link" :href="`tel:${groupContact.landline}`">
                {{ groupContact.landline }}
              </a>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="contact-label">Sales &amp; Dispensing</div>
              <a class="contact-link" :href="`tel:${groupContact.mobileRetail}`">
                {{ groupContact.mobileRetail }}
              </a>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="contact-label">Sourcing &amp; Supply</div>
              <a class="contact-link" :href="`tel:${groupContact.mobileSupply}`">
                {{ groupContact.mobileSupply }}
              </a>
            </v-col>
            <v-col cols="12">
              <div class="contact-label">Email</div>
              <a class="contact-link" :href="`mailto:${groupContact.email}`">
                {{ groupContact.email }}
              </a>
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>