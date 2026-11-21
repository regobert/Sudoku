# Sudoku Schrift

Een web-app om sudoku's te fotograferen, te spelen en te bewaren.

- **Foto van sudoku**: maak een foto (of kies er een) van een sudoku uit een boekje, krant of app.
  - **Geef een hint**: je krijgt alleen een tip voor de volgende stap, in drie niveaus (waar kijken, welk vakje, welk cijfer).
  - **Digitaliseren**: de puzzel komt in je verzameling. Een moeilijkheidsgraad op de foto (bijvoorbeeld 7 sterren) wordt overgenomen.
- **Controleren**: de app controleert je oplossing en viert het met confetti als alles klopt.
- **Bediening**: cijfers, notities, kleuren, terug/vooruit, wissen, hint, opnieuw beginnen.

## Openen

De app is een statische website en draait op GitHub Pages:
<https://regobert.github.io/Sudoku/>

## Installeren als app

Sudoku Schrift is een installeerbare web-app (PWA). Na installatie staat hij als app op je beginscherm, opent hij schermvullend en werkt hij ook zonder internet. Alleen fotoherkenning heeft internet nodig.

- **Android (Pixel)**: open de link in Chrome en tik op **App installeren**, op de startpagina of via **⋮ → App installeren**.
- **iPad / iPhone**: open de link in Safari, tik op **Deel** en kies **Zet op beginscherm**.

Een geïnstalleerde app op de iPad bewaart zijn verzameling apart van Safari.

## Fotoherkenning

Foto's worden gelezen met Claude (model `claude-opus-5-5`) via de Anthropic API.
Daarvoor vul je eenmalig je eigen API-sleutel in via het tandwiel rechtsboven.
Maak een sleutel aan op <https://console.anthropic.com/settings/keys>.

- De sleutel wordt alleen in de browser van je eigen apparaat bewaard (`localStorage`) en gaat alleen naar `api.anthropic.com`.
- Een foto lezen kost een paar cent van je API-tegoed.
- Gebruik de app met sleutel alleen op je eigen apparaten.

Zonder sleutel kun je een puzzel ook zelf overtypen.

## Opslag

Je verzameling en voortgang worden bewaard in de browser van het apparaat waarop je speelt.
Een andere browser of een ander apparaat heeft een eigen verzameling.

## Bestanden

- `index.html`: de hele app (HTML, CSS en JavaScript).
- `manifest.webmanifest`, `sw.js`, `icons/`: maken de app installeerbaar en offline bruikbaar. Verhoog `VERSION` in `sw.js` als je bestanden wijzigt.
- `vendor/anthropic-sdk-1.6.0.mjs`: de officiële Anthropic TypeScript SDK (`@anthropic-ai/sdk` 1.6.0), gebundeld voor de browser.
  Opnieuw maken:

  ```bash
  npm i @anthropic-ai/sdk@1.6.0 esbuild
  echo 'export { default } from "@anthropic-ai/sdk";' > entry.mjs
  npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile=vendor/anthropic-sdk-1.6.0.mjs
  ```

## Lokaal draaien

```bash
python3 -m http.server 8000
```

Open daarna <http://localhost:8000>.
