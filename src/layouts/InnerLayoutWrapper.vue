<script lang="ts" setup>
import { onMounted } from 'vue'
import { useLandingController } from '@/controller/landingController'
import Sidebar1 from '@/components/common/sideBar/Sidebar.vue'

const { data, fetchLandingData } = useLandingController()

onMounted(async () => {
  await fetchLandingData()
})
</script>

<template>
  <v-app>
    <div class="custom-shape-divider-top-1787546049">
      <svg
        data-name="Layer 1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <path
          d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
          class="shape-fill"
        ></path>
      </svg>
    </div>
    <!-- Left Sidebar - Takes full left side -->
    <Sidebar1 :version="data?.version" />

    <!-- Dynamic Navbar Selection - Positioned to the right of sidebar -->
    <InsideNavbar1
      v-if="data?.ui?.navbarComponent === '1'"
      :config="data?.ui"
      class="navbar-with-sidebar"
    />

    <InsideNavbar2
      v-else-if="data?.ui?.navbarComponent === '2'"
      :config="data?.ui"
      class="navbar-with-sidebar"
    />

    <InsideNavbar3
      v-else-if="data?.ui?.navbarComponent === '3'"
      :config="data?.ui"
      class="navbar-with-sidebar"
    />

    <InsideNavbar4
      v-else-if="data?.ui?.navbarComponent === '4'"
      :config="data?.ui"
      class="navbar-with-sidebar"
    />

    <v-main class="main-with-sidebar">
      <div style="margin-top: 1.2rem"></div>
      <slot name="content">
        <router-view />
      </slot>
    </v-main>

    <OuterFooter v-if="data?.ui?.footerComponent === '1'" :config="data?.ui" compact />
    <OuterFooter2 v-else-if="data?.ui?.footerComponent === '2'" :config="data?.ui" compact />
  </v-app>
</template>

<style scoped>
/* Navbar positioning - push to the right of sidebar */
.navbar-with-sidebar {
  margin-left: 280px; /* Match sidebar width */
  width: calc(100% - 280px); /* Adjust width to account for sidebar */
}

/* Main content positioning */
.main-with-sidebar {
  padding-left: 280px; /* Match sidebar width */
  padding-top: 64px; /* Account for navbar height */
}

/* Responsive behavior for small screens */
@media (max-width: 960px) {
  .navbar-with-sidebar {
    margin-left: 0;
    width: 100%;
  }

  .main-with-sidebar {
    padding-left: 0;
    padding-top: 64px; /* Keep top padding for mobile navbar */
  }
}

/* Ensure proper spacing and layout */
.v-app {
  position: relative;
}

.custom-shape-divider-top-1787546049 {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  overflow: hidden;
  line-height: 0;
}

.custom-shape-divider-top-1787546049 svg {
  position: relative;
  display: block;
  width: calc(118% + 1.3px);
  height: 106px;
}

.custom-shape-divider-top-1787546049 .shape-fill {
  fill: #bc1212;
}
</style>
