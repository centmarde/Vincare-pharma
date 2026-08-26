<script lang="ts" setup>
defineEmits<{ (e: 'scroll', id: string): void }>()

/**
 * The visual panel is decorative. It is driven by a prop so the page can point it
 * at whatever asset is published without the component knowing about the JSON
 * feed; if the file is missing the panel still reads correctly because the
 * gradient wash underneath it carries the text.
 */
withDefaults(defineProps<{ imageSrc?: string; imageAlt?: string }>(), {
  imageSrc: '/assets/pharmacy-distribution.png',
  imageAlt: 'Pharmaceutical distribution warehouse in Butuan City, Philippines',
})

/**
 * The three steps of the trade, in the order the goods actually move. Kept short
 * enough to read at a glance over the photograph.
 */
const glance = [
  { step: '01', title: 'Source', note: 'Trusted suppliers' },
  { step: '02', title: 'Control', note: 'Tracked inventory' },
  { step: '03', title: 'Deliver', note: 'On schedule' },
]
</script>

<template>
  <section class="hero">
    <v-container class="py-16">
      <v-row align="center">
        <!-- ── Copy ───────────────────────────────────────────────────────── -->
        <v-col cols="12" md="6">
          <div class="hero-eyebrow mb-6">Pharmaceutical Distribution &middot; Butuan City</div>

          <h1 class="hero-motto mb-8">
            Your health,<br />
            <em class="hero-motto-accent">our care.</em>
          </h1>

          <div class="hero-rule mb-8"></div>

          <p class="hero-lead mb-4">
            We keep essential medicines moving &mdash; with the stock, controls and accountability
            that healthcare providers can count on.
          </p>

          <p class="hero-body mb-10">
            Vincare Pharma and Exelmed Pharma Trade supply medicines and medical goods to government
            health facilities, private clinics and retail pharmacies across Agusan del Norte.
          </p>

          <div class="d-flex flex-column flex-sm-row ga-3">
            <v-btn
              class="text-none px-7 hero-cta"
              color="primary"
              size="large"
              variant="flat"
              rounded="0"
              append-icon="mdi-arrow-right"
              to="/auth"
            >
              Start a conversation
            </v-btn>

            <v-btn
              class="text-none px-7 hero-cta"
              size="large"
              variant="outlined"
              rounded="0"
              @click="$emit('scroll', 'capabilities')"
            >
              See how it works
            </v-btn>
          </div>
        </v-col>

        <!-- ── Visual panel ───────────────────────────────────────────────── -->
        <v-col cols="12" md="6" class="mt-12 mt-md-0">
          <figure class="hero-panel">
            <img class="hero-panel-image" :src="imageSrc" :alt="imageAlt" />

            <div class="hero-panel-scrim"></div>

            <figcaption class="hero-panel-tag">At a glance</figcaption>

            <div class="hero-panel-body">
              <div class="hero-glance">
                <div v-for="item in glance" :key="item.step" class="hero-glance-item">
                  <div class="hero-glance-step">{{ item.step }}</div>
                  <div class="hero-glance-title">{{ item.title }}</div>
                  <div class="hero-glance-note">{{ item.note }}</div>
                </div>
              </div>

              <div class="hero-panel-rule"></div>

              <blockquote class="hero-panel-quote">
                &ldquo;The right product, in the right place, with a record you can trust.&rdquo;
              </blockquote>
            </div>
          </figure>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>
