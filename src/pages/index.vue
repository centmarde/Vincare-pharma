<script lang="ts" setup>
import { onMounted } from 'vue'
import { useLandingController } from '@/controller/landingController'
import { companyProfiles, groupContact } from '@/utils/companyProfiles'
import OuterLayoutWrapper from '@/layouts/OuterLayoutWrapper.vue'

const { data, loading, error, fetchLandingData } = useLandingController()

onMounted(async () => {
  await fetchLandingData()
})

function scrollTo(id: string) {
  document.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Credentials come from the SAME constant that prints on every invoice, receipt
 * and voucher (src/utils/companyProfiles.ts). An institutional buyer checks the
 * licence on the paperwork against the one on the website; keeping both from one
 * source means they cannot drift apart.
 */
const exelmed = companyProfiles.exelmed
const vincare = companyProfiles.vincare

/**
 * The three channels the business actually trades through — the same split the
 * system is built around (In-House / Ethical / Retail), not invented segments.
 */
const channels = [
  {
    eyebrow: 'Institutional',
    title: 'Government & LGU Supply',
    body: 'Supply against agency purchase requests and purchase orders, with delivery receipts, statements of account and payment terms handled end to end.',
    points: ['Purchase request to delivery receipt', 'Statements of account and aging', 'Terms-based settlement'],
  },
  {
    eyebrow: 'Professional',
    title: 'Ethical & Clinic Accounts',
    body: 'Direct supply to private clinics, hospitals and practitioners through assigned field representatives, on agreed credit terms.',
    points: ['Assigned account representatives', 'Agreed discount and rebate terms', 'Scheduled collections'],
  },
  {
    eyebrow: 'Retail',
    title: 'Pharmacy Counter',
    body: 'Over-the-counter dispensing through Exelmed Pharma Trade, on the same stock and pricing controls as the institutional channels.',
    points: ['Batch and expiry controlled', 'Branch-level stock', 'Daily cash reconciliation'],
  },
]

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
  <OuterLayoutWrapper>
    <template #content>
      <div class="landing">
        <v-container
          v-if="loading"
          class="d-flex justify-center align-center"
          style="min-height: 60vh"
        >
          <v-progress-circular color="primary" indeterminate size="56" />
        </v-container>

        <v-container
          v-else-if="error"
          class="d-flex justify-center align-center"
          style="min-height: 60vh"
        >
          <v-alert type="error" variant="tonal" icon="mdi-alert-circle">
            <v-alert-title>Failed to load content</v-alert-title>
          </v-alert>
        </v-container>

        <div v-else-if="data">
          <!-- ── Hero ─────────────────────────────────────────────────────── -->
          <section class="hero">
            <v-container class="py-16">
              <v-row justify="center">
                <v-col cols="12" md="10" lg="9">
                  <div class="hero-eyebrow mb-5">
                    Pharmaceutical Distribution &middot; Butuan City
                  </div>

                  <h1 class="hero-motto mb-6">Your Health,<br class="d-sm-none" /> Our Care</h1>

                  <div class="hero-rule mb-6"></div>

                  <p class="hero-lead mb-4">
                    Vincare Pharma and Exelmed Pharma Trade supply medicines and medical
                    goods to government health facilities, private clinics and retail
                    pharmacies.
                  </p>

                  <p class="hero-body mb-10">
                    We hold the stock, carry the terms and deliver on schedule &mdash; with
                    the paperwork, batch traceability and financial records to account for
                    every transaction.
                  </p>

                  <div class="d-flex flex-column flex-sm-row ga-3">
                    <v-btn
                      class="text-none px-8"
                      color="primary"
                      size="large"
                      variant="flat"
                      to="/auth"
                    >
                      Partner Sign In
                    </v-btn>

                    <v-btn
                      class="text-none px-8"
                      size="large"
                      variant="outlined"
                      @click="scrollTo('capabilities')"
                    >
                      What We Do
                    </v-btn>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- ── Registered credentials ───────────────────────────────────── -->
          <section class="credentials">
            <v-container>
              <v-row align="stretch" justify="center">
                <v-col cols="12" sm="6" md="3">
                  <div class="cred-label">Licence to Operate</div>
                  <div class="cred-value">3000001108883</div>
                  <div class="cred-note">{{ exelmed.name }}</div>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <div class="cred-label">VAT Registered TIN</div>
                  <div class="cred-value">178-845-363-000</div>
                  <div class="cred-note">{{ exelmed.name }}</div>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <div class="cred-label">VAT Registered TIN</div>
                  <div class="cred-value">176-395-238-000</div>
                  <div class="cred-note">{{ vincare.name }}</div>
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <div class="cred-label">Catalogue</div>
                  <div class="cred-value">2,400+</div>
                  <div class="cred-note">Stock-keeping units</div>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- ── Channels ─────────────────────────────────────────────────── -->
          <section id="capabilities" class="section">
            <v-container>
              <div class="section-head mb-12">
                <div class="section-eyebrow mb-3">Who We Supply</div>
                <h2 class="section-title mb-4">Three channels, one supply chain</h2>
                <p class="section-lead">
                  The same stock, the same controls and the same accountability, whether the
                  buyer is a municipal health office, a private clinic or a walk-in customer.
                </p>
              </div>

              <v-row>
                <v-col v-for="channel in channels" :key="channel.title" cols="12" md="4">
                  <v-card class="channel h-100" flat>
                    <v-card-text class="pa-7">
                      <div class="channel-eyebrow mb-3">{{ channel.eyebrow }}</div>
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

          <!-- ── Assurances ───────────────────────────────────────────────── -->
          <section class="section section-alt">
            <v-container>
              <v-row>
                <v-col cols="12" md="4">
                  <div class="section-eyebrow mb-3">How We Operate</div>
                  <h2 class="section-title mb-4">Accountable by design</h2>
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

          <!-- ── Platform (JSON-driven, unchanged data source) ────────────── -->
          <section id="features" class="section">
            <v-container>
              <div class="section-head mb-12">
                <div class="section-eyebrow mb-3">The Platform</div>
                <h2 class="section-title mb-4">{{ data.title }}</h2>
                <p class="section-lead">{{ data.subtitle }}</p>
              </div>

              <v-row>
                <v-col
                  v-for="feature in data.features"
                  :key="feature.title"
                  cols="12"
                  md="4"
                >
                  <div class="feature h-100">
                    <div class="feature-icon mb-5">
                      <v-icon :icon="feature.icon" size="24" />
                    </div>
                    <h3 class="feature-title mb-3">{{ feature.title }}</h3>
                    <p class="feature-body">{{ feature.description }}</p>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- ── The group ────────────────────────────────────────────────── -->
          <section class="section section-alt">
            <v-container>
              <div class="section-head mb-10">
                <div class="section-eyebrow mb-3">The Group</div>
                <h2 class="section-title mb-4">Two companies, one operation</h2>
                <p class="section-lead">
                  Both are registered trading entities working the same supply chain.
                  Which one appears on your paperwork depends on the side of the
                  transaction you are on.
                </p>
              </div>

              <v-row>
                <v-col cols="12" md="6">
                  <div class="entity pa-7 h-100">
                    <h3 class="entity-name mb-2">{{ vincare.name }}</h3>
                    <div class="entity-role mb-5">Sourcing and supply</div>
                    <p class="entity-body mb-6">
                      Buys from manufacturers and suppliers. Purchase orders, supplier
                      canvassing and inbound goods are issued and received under Vincare.
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
                      Sells to health facilities, clinics and the public. Invoices, delivery
                      receipts and official receipts are issued under Exelmed.
                    </p>
                    <v-divider class="mb-4" />
                    <div class="entity-meta">{{ exelmed.line1 }}</div>
                    <div class="entity-meta">Licence 3000001108883 &middot; VAT Reg TIN 178-845-363-000</div>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- ── Contact ──────────────────────────────────────────────────── -->
          <section id="contact" class="section">
            <v-container>
              <v-row>
                <v-col cols="12" md="4">
                  <div class="section-eyebrow mb-3">Get In Touch</div>
                  <h2 class="section-title mb-4">Talk to us about supply</h2>
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

          <!-- ── Close ────────────────────────────────────────────────────── -->
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
        </div>
      </div>
    </template>
  </OuterLayoutWrapper>
</template>

<style scoped>
.landing {
  min-height: 100vh;
}

/* ── Hero ──────────────────────────────────────────────────────────────── */
.hero {
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.hero-eyebrow {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

/* The motto carries the page; sized by viewport so it stays commanding on a
   projector and still fits a phone. */
.hero-motto {
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: rgb(var(--v-theme-on-surface));
}

.hero-rule {
  width: 72px;
  height: 4px;
  background: rgb(var(--v-theme-primary));
}

.hero-lead {
  font-size: clamp(1.05rem, 2vw, 1.3rem);
  line-height: 1.6;
  font-weight: 500;
  max-width: 60ch;
  color: rgb(var(--v-theme-on-surface));
}

.hero-body {
  font-size: 1rem;
  line-height: 1.75;
  max-width: 62ch;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

/* ── Credentials ───────────────────────────────────────────────────────── */
.credentials {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding: 2.5rem 0;
}

.cred-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 0.4rem;
}

.cred-value {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.2;
}

.cred-note {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 0.15rem;
}

/* ── Sections ──────────────────────────────────────────────────────────── */
.section {
  padding: 6rem 0;
}

.section-alt {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.section-head {
  max-width: 62ch;
}

.section-eyebrow {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

.section-title {
  font-size: clamp(1.6rem, 3.2vw, 2.35rem);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -0.015em;
  color: rgb(var(--v-theme-on-surface));
}

.section-lead {
  font-size: 1rem;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin-bottom: 0;
}

/* ── Channels ──────────────────────────────────────────────────────────── */
.channel {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  transition: border-color 0.18s ease;
}

.channel:hover {
  border-color: rgb(var(--v-theme-primary));
}

.channel-eyebrow {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

.channel-title {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.3;
  color: rgb(var(--v-theme-on-surface));
}

.channel-body {
  font-size: 0.94rem;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin-bottom: 0;
}

.channel-point {
  font-size: 0.88rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

/* ── Assurances ────────────────────────────────────────────────────────── */
.assurance {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 4px;
}

.assurance-title {
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.35;
  color: rgb(var(--v-theme-on-surface));
}

.assurance-body {
  font-size: 0.89rem;
  line-height: 1.65;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 0;
}

/* ── Platform features ─────────────────────────────────────────────────── */
.feature-icon {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
  border-radius: 4px;
  color: rgb(var(--v-theme-primary));
}

.feature-title {
  font-size: 1.12rem;
  font-weight: 700;
  line-height: 1.35;
  color: rgb(var(--v-theme-on-surface));
}

.feature-body {
  font-size: 0.92rem;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin-bottom: 0;
}

/* ── Group entities ────────────────────────────────────────────────────── */
.entity {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-top: 3px solid rgb(var(--v-theme-primary));
  border-radius: 4px;
}

.entity-name {
  font-size: 1.28rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  color: rgb(var(--v-theme-on-surface));
}

.entity-role {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
}

.entity-body {
  font-size: 0.94rem;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin-bottom: 0;
}

.entity-meta {
  font-size: 0.82rem;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* ── Contact ───────────────────────────────────────────────────────────── */
.contact-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 0.35rem;
}

.contact-value {
  font-size: 0.98rem;
  line-height: 1.6;
  color: rgb(var(--v-theme-on-surface));
}

.contact-link {
  font-size: 0.98rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.contact-link:hover {
  border-bottom-color: rgb(var(--v-theme-primary));
}

/* ── Closing ───────────────────────────────────────────────────────────── */
.closing {
  background: rgb(var(--v-theme-primary));
}

.closing-title {
  font-size: clamp(1.35rem, 2.8vw, 1.95rem);
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: #fff;
}

.closing-body {
  font-size: 0.9rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.82);
}
</style>
