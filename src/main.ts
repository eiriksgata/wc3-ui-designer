import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { vuetify } from './plugins/vuetify';

createApp(App).use(vuetify).mount('#app');

