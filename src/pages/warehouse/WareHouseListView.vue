<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import WareHouseListWidget from './components/WareHouseListWidget.vue'
import WareHouseListMobile from './mobile/WareHouseListMobile.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>
              <v-col cols="12">
                <div class="d-none d-sm-block">
                  <WareHouseListWidget />
                </div>
                <div class="d-block d-sm-none">
                  <WareHouseListMobile />
                </div>
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
