<main>
  <h1>Settings</h1>
  <p>
    Model catalogs are discovered from your account when you request a refresh. This page does not
    store API keys. Keys stay in server environment variables.
  </p>
  <section>
    <h2>TheClawBay</h2>
    <p>Base URL https://api.theclawbay.com/v1</p>
    <p>Preferred model grok-4.7 only when that account catalog returns it.</p>
  </section>
  <section>
    <h2>DeepSeek</h2>
    <p>Base URL https://api.deepseek.com</p>
    <p>Direct DeepSeek is a separate account. It is not a silent fallback for TheClawBay.</p>
  </section>
  <p data-testid="catalog-status">Catalog not loaded. No model call has been made.</p>
  <p>Incompatible models stay listed with a reason and cannot draft a thesis.</p>
</main>
