/**
 * plugins/toast.ts
 *
 * Vue Toastification plugin configuration
 */

import Toast, { POSITION } from "vue-toastification";
import type { PluginOptions } from "vue-toastification";
import type { App } from 'vue'

const options: PluginOptions = {
  position: POSITION.TOP_RIGHT,
  timeout: 5000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: "button",
  icon: true,
  rtl: false
}

export default function (app: App) {
  app.use(Toast, options)
}
