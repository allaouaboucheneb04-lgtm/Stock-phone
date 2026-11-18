# Stock IMEI — application de gestion de téléphones

Application Web Progressive (PWA), entièrement en français, adaptée à l'iPhone et à Android.

## Fonctions

- Fiche individuelle avec IMEI 1 (obligatoire) et IMEI 2 (facultatif), contrôle Luhn et refus des doublons.
- Scanner les QR codes, codes-barres Code 128, Data Matrix, etc. avec la caméra arrière ; scan d'une photo ; saisie manuelle si nécessaire.
- Après un scan ou la saisie d'un IMEI valide, proposition automatique de la **marque** et du **modèle** à partir des 8 premiers chiffres (TAC). Les champs déjà remplis ne sont pas remplacés.
- Détails : marque, modèle, capacité, couleur, état, série, prix d'achat / vente, fournisseur, emplacement, photo et notes.
- États : **En stock**, **Réservé**, **Vendu** ; entrée et vente enregistrées dans un historique.
- Recherche par IMEI, IMEI 2, modèle, série, marque, etc. ; filtres et statistiques.
- Export JSON intégral (y compris les photos), restauration JSON et export CSV compatible Excel.
- Stockage **local sur l'appareil** via IndexedDB, sans serveur ni abonnement. Pas de compte partagé ni de synchronisation entre appareils dans cette version.

## Installer sur iPhone

1. Placez **tous les fichiers** de ce dossier sur un hébergement statique HTTPS, par exemple Netlify Drop, Cloudflare Pages ou GitHub Pages. Il faut conserver la structure du dossier `icons`.
2. Ouvrez l'adresse HTTPS dans Safari sur l'iPhone.
3. Touchez **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
4. Ouvrez l'icône Stock IMEI, puis touchez **Scanner** et autorisez la caméra.

**Attention :** ouvrir `index.html` directement depuis l'application Fichiers de l'iPhone ne donne pas les permissions caméra ni le mode PWA requis. L'hébergement HTTPS est indispensable.

La bibliothèque de scan `html5-qrcode@2.3.8` est chargée à la première utilisation du scanner depuis jsDelivr, avec un secours unpkg. Elle est mise en cache pour les scans suivants dans la mesure où Safari autorise ce cache. La gestion du stock et les sauvegardes fonctionnent sans connexion une fois l'application installée et ses fichiers mis en cache.

## Identification automatique par TAC

Une fois l'IMEI lu, la fiche lance une recherche dans une **base publique communautaire de TAC**. Si la référence existe, la marque et le modèle sont proposés ; vérifiez le modèle indiqué sur la boîte avant l'enregistrement. La **capacité**, la **couleur**, le **statut de blocage** et l'authenticité du téléphone ne sont **pas** déduits du TAC.

Source : [MoazEb/tac-database](https://github.com/MoazEb/tac-database), version d'octobre 2026 (licence affichée MIT ; données compilées à partir de sources variées, dont Osmocom). L'IMEI complet n'est jamais envoyé à cette source : l'application récupère **la même liste publique** pour chaque utilisateur, puis la recherche se fait localement sur l'appareil.

**Première utilisation :** une connexion Internet est requise pour télécharger environ 12,6 Mo de CSV avant l'identification. Le navigateur peut conserver la liste en cache pour les recherches suivantes ; si ce cache est effacé, le téléchargement sera nécessaire à nouveau. Une erreur réseau ou une référence inconnue n'empêche pas de saisir la marque et le modèle manuellement. Ce service n'est **pas** une vérification GSMA officielle.

## Sauvegardes

- **Réglages → Télécharger la sauvegarde (.json)** au moins une fois par jour ou après chaque série d'entrées/ventes.
- Stockez une copie hors de l'iPhone (iCloud Drive, ordinateur, autre disque).
- **Restaurer** remplace toutes les données existantes. Vérifiez la sauvegarde avant de confirmer.
- CSV est destiné à Excel et ne remplace **pas** le JSON pour une restauration complète.

## Tester sur ordinateur

Depuis le dossier du projet :

```bash
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080` dans le navigateur. `localhost` est un contexte sécurisé reconnu par les navigateurs, mais pour scanner depuis l'iPhone, il faut un site HTTPS.

## Limitations

- Les informations du modèle ne sont **pas** déduites automatiquement du seul IMEI (il faudrait un service externe de base TAC, souvent payant).
- Un QR code doit contenir un IMEI valide pour être associé à un téléphone. Les autres QR codes (liens, numéros de série seuls) ne suffisent pas.
- Aucun stockage cloud ni synchronisation, ni multi-utilisateur dans cette version.
- Le scanner nécessite l'autorisation de la caméra et HTTPS ; sinon la saisie manuelle reste disponible.
- Stockage iOS : Safari peut supprimer les données locales dans certaines circonstances. Exportez régulièrement.