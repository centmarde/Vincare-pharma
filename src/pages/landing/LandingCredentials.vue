<script lang="ts" setup>
/**
 * The four figures a buyer weighs up before they enquire: how much we carry, how
 * much of it is traceable, how many places they have to look for the record, and
 * where we are.
 *
 * These are deliberately NOT the licence and TIN numbers — those are registered
 * credentials and are printed in full by LandingGroup.vue, sourced from the same
 * constant that prints on every invoice (src/utils/companyProfiles.ts) so the
 * two can never drift apart.
 */
const stats = [
  { value: '2,400+', label: 'Catalogue items' },
  { value: '100%', label: 'Traceable stock' },
  { value: '1', label: 'Connected record' },
  { value: 'Butuan', label: 'Based & responsive' },
]
</script>

<template>
  <section class="credentials">
    <v-container>
      <v-row align="stretch" no-gutters>
        <v-col v-for="stat in stats" :key="stat.label" cols="6" md="3">
          <div class="cred-item">
            <div class="cred-value">{{ stat.value }}</div>
            <div class="cred-label">{{ stat.label }}</div>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>
