# Sudoku Schrift

Een web-app om sudoku's te fotograferen, te spelen en te bewaren.

- **Foto van sudoku**: maak een foto (of kies er een) van een sudoku uit een boekje, krant of app.
  - **Geef een hint**: je krijgt alleen een tip voor de volgende stap, in drie niveaus (waar kijken, welk vakje, welk cijfer).
  - **Digitaliseren**: de puzzel komt in je verzameling. Een moeilijkheidsgraad op de foto (bijvoorbeeld 7 sterren) wordt overgenomen.
- **Controleren**: de app controleert je oplossing en viert het met confetti als alles klopt.
- **Bediening**: cijfers, notities, kleuren, terug/vooruit, wissen, hint, opnieuw beginnen.

## Thermosudoku

Een aparte soort puzzel: op elke thermometer worden de cijfers vanaf het bolletje steeds hoger.

- **Nieuwe puzzel → Thermo**: de app maakt thermosudoku's op dezelfde sterrenschaal (3 t/m 13).
- **Van een foto**: Claude leest ook de thermometers. Met de gratis herkenning teken je ze zelf in het controlescherm (**Thermometer tekenen**, begin bij het bolletje).
- **Filter**: bij Mijn puzzels en in de verzameling kies je bij **Soort** voor Klassiek of Thermo.
- Hints, Controleer en de foutmelding houden rekening met de thermometers.

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

### Gratis herkenning (zonder sleutel)

Zonder API-sleutel, of als Claude niet lukt (bijvoorbeeld geen tegoed), leest de app de foto gratis op het apparaat zelf met [Tesseract](https://github.com/naptha/tesseract.js):
het raster wordt gezocht en rechtgetrokken, elk vakje wordt apart gelezen, en een scheve of gedraaide foto wordt automatisch gedraaid.
Twijfelgevallen worden oranje omrand. Sterren en ingevulde cijfers worden minder goed herkend dan met Claude.
Bij Instellingen kun je met **Altijd gratis herkenning** ook met een sleutel de gratis versie gebruiken.

Je kunt een puzzel ook zelf overtypen.

## Opslag

Je verzameling en voortgang worden bewaard in de browser van het apparaat waarop je speelt.
Een andere browser of een ander apparaat heeft een eigen verzameling.

## Back-up en overzetten

Via het tandwiel of **Back-up** bij Mijn puzzels:

1. **Back-up maken**: met **Delen** (telefoon/tablet: AirDrop, WhatsApp, e-mail, Google Drive) of **Bestand opslaan**.
2. **Terugzetten**: open de app op het andere apparaat en kies **Back-up terugzetten**.

Terugzetten voegt samen: nieuwe puzzels komen erbij, en van een puzzel die op beide apparaten staat blijft de nieuwste versie bewaard. De API-sleutel zit niet in de back-up.

## Bestanden

- `index.html`: de hele app (HTML, CSS en JavaScript).
- `ocr.js`: gratis herkenning op het apparaat.
- `vendor/tesseract/`: Tesseract.js 6.0.1 (Apache-2.0) met de Engelse taaldata (tessdata best_int), alleen geladen als je de gratis herkenning gebruikt.
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
