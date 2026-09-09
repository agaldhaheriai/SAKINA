# Sakina — سكينة

A facial-expression check-in that opens a supportive conversation, then offers a plan,
calming practices, a sensory kit, books, and the nearest mental-health support in the UAE.

تطبيق يقرأ تعبير الوجه ويفتح محادثة داعمة، ثم يقدّم خطة وممارسات تهدئة وأدوات حسّية
وكتبًا مقترحة وأقرب مراكز الدعم النفسي في الإمارات.

Developer / المطوِّرة: **Amna Al Dhaheri — آمنة الظاهري**

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app in one file. The Teachable Machine model and its weights are embedded as base64 and run in the browser with TensorFlow.js — no server, no uploads. ~3 MB. |
| `manifest.json` | PWA manifest (name, theme colour, icons). |
| `icons/` | App icons: 1024 for the stores, 512/192 for the PWA, 180 apple-touch, maskable 512, favicon.ico. |
| `model/` | The original Teachable Machine export — `model.json`, `weights.bin`, `metadata.json`. Kept for retraining; the app does not load these at runtime. |

## Publishing

1. Upload `index.html`, `manifest.json` and the `icons/` folder to the site root
   (e.g. amnaai.atwebpages.com), keeping the folder structure.
2. Open it over **HTTPS** — the camera, the microphone and the location feature all
   require a secure origin. Opening the file directly from disk will not work.
3. For a store app, point Median.co at the URL and upload `icons/sakina-icon-1024.png`.

## Retraining the model

Train in Google Teachable Machine, export as **TensorFlow.js**, then replace the two
base64 strings near the top of the `<script>` block in `index.html`:
`MODEL_JSON_B64` (model.json) and `WEIGHTS_B64` (weights.bin), each as standard base64.
Keep the three class names in the same order: Sadness, Happiness, Anger.

## Note

Sakina is a wellbeing companion, not a therapist, and nothing in it is a diagnosis or
medical advice. Emergency in the UAE: 999.
