<script lang="ts" setup>
import { companyProfiles } from '@/utils/companyProfiles'

const exelmed = companyProfiles.exelmed
const vincare = companyProfiles.vincare
</script>

<template>
  <section class="section section-alt">
    <v-container>
      <div class="section-head mb-10">
        <div class="section-eyebrow mb-3">The Group</div>
        <h2 class="section-title section-title-display mb-4">
          Two companies, <br /><em class="section-title-accent">one operation</em>
        </h2>
        <p class="section-lead">
          Both are registered trading entities working the same supply chain. Which one appears on
          your paperwork depends on the side of the transaction you are on.
        </p>
      </div>

      <!-- Decorative cover photograph of the shared headquarters (NB Building,
           Ochoa Avenue). Replaces the placeholder the hero panel uses and keeps
           the same cover-ratio / scrim pattern as .hero-panel. -->
      <figure class="group-cover mb-12">
        <img
          class="group-cover-image"
          src="/assets/clinic-pharmacy.png"
          alt="NB Building, Ground Floor and 2nd Floor, Ochoa Avenue, Butuan City — the headquarters both Vincare Pharma and Exelmed Pharma Trade operate from"
        />
        <figcaption class="group-cover-caption">
          Our shared headquarters on Ochoa Avenue, Butuan City
        </figcaption>
      </figure>

      <v-row>
        <v-col cols="12" md="6">
          <div class="entity pa-7 h-100">
            <h3 class="entity-name mb-2">{{ vincare.name }}</h3>
            <div class="entity-role mb-5">Sourcing and supply</div>
            <p class="entity-body mb-6">
              Buys from manufacturers and suppliers. Purchase orders, supplier canvassing and
              inbound goods are issued and received under Vincare.
            </p>
            <v-divider class="mb-4" />
            <div class="entity-meta">{{ vincare.line1 }}</div>
            <div class="entity-meta">VAT Reg TIN 176-395-238-000</div>
          </div>
        </v-col>

        <v-col cols="12" md="6">
          <div class="entity pa-7 h-100">
            <h3 class="entity-name mb-2">{{ exelmed.name }}</h3>
            <div class="entity-role mb-5">Distribution and dispensing</div>
            <p class="entity-body mb-6">
              Sells to health facilities, clinics and the public. Invoices, delivery receipts and
              official receipts are issued under Exelmed.
            </p>
            <v-divider class="mb-4" />
            <div class="entity-meta">{{ exelmed.line1 }}</div>
            <div class="entity-meta">
              Licence 3000001108883 &middot; VAT Reg TIN 178-845-363-000
            </div>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>
