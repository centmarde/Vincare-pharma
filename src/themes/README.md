# Themes

This folder contains the theme configuration for the application.

## Color Palette

### Primary Colors
- **Primary**: `#556B2F` (Dark Olive Green) - Main brand color
- **Texture**: `#EFF5D2` (Light Green/Cream) - Secondary background color

### Theme Structure
- `base.ts` - Contains the light and dark theme definitions
- `index.ts` - Exports theme configuration for Vuetify

## Usage

The themes are automatically applied through the Vuetify plugin configuration. To use theme colors in components:

```vue
<template>
  <!-- Using Vuetify color props -->
  <v-btn color="primary">Primary Button</v-btn>
  <v-card color="secondary">Secondary Card</v-card>
  
  <!-- Using CSS classes -->
  <div class="bg-primary text-on-primary">
    Content with primary background
  </div>
</template>
```

## Color Variations

Each theme includes multiple variations of the base colors:
- `primary`, `primary-darken-1`, `primary-lighten-1`, `primary-lighten-2`
- `secondary`, `secondary-darken-1`, `secondary-lighten-1`
- `accent`, `accent-darken-1`, `accent-lighten-1`

## Dark Mode

The application supports both light and dark themes. The dark theme automatically adapts the colors for better visibility in low-light conditions while maintaining the brand identity.

## Customization

To modify colors:
1. Update the color values in `src/themes/base.ts`
2. Update the SCSS variables in `src/styles/settings.scss`
3. The changes will be applied automatically through the Vuetify theme system
