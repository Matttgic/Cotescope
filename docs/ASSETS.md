# Éléments visuels

- `public/media/sports-night.webp` : illustration originale générée pour CoteScope, style photographie sportive. Elle sert de décoration et ne représente aucun match du flux. Export WebP de 1 600 × 900 pixels, environ 129 Kio. L’original reste dans `/workspace/generated_images`.
- `public/brands/cotescope-mark.svg` : symbole vectoriel créé pour CoteScope, utilisé dans la navigation et comme favicon.
- `public/fonts/manrope-latin-variable.woff2` : Manrope, distribuée par Fontsource (`@fontsource-variable/manrope@5.2.8`). Licence et mentions dans `public/fonts/OFL-manrope.txt`. Police servie localement, sans appel à Google Fonts.
- `public/teams/*.png` : 19 écussons issus du dépôt [luukhopman/football-logos](https://github.com/luukhopman/football-logos), révision `2a3978f0b4730645c205d855a4bda54c161183e9`, dossier `logos`. Les marques appartiennent à leurs clubs respectifs ; cette attribution n’accorde pas de licence sur ces marques. Les alias de clubs sont explicites dans `EventVisual.tsx`. Une ville ambiguë et un club inconnu utilisent un pictogramme de sport.
- Les badges de bookmakers sont des libellés typographiques créés dans l’interface, pas des logos officiels téléchargés. Les pictogrammes de sport sont des SVG locaux.

Les images et la police sont hébergées dans le projet. Le navigateur ne contacte pas de serveur de photos ou de logos tiers. Les images sont décoratives (`alt=""`) lorsque le nom du match est déjà affiché en texte.
