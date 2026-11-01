'use strict';

/* ==========================================================================
   Screenshots for marker popups
   A picture listed here is shown at the top of that marker's popup. Click it
   in the app to open it full size.

   Key    the marker's title exactly as it appears in the popup (capitalization does
          not matter), or "id:<location id>" if two markers share a title.
   Value  a list of image files, relative to this folder. png, jpg and webp work.
          Put the files in the screenshots/ folder. A file that is missing is simply
          not shown, so entries can be added before the pictures exist.

   Markers can also pick up pictures the data file names (its "media" list): drop a
   file called exactly that in the media/ folder and it appears automatically.
   ========================================================================== */
window.HYRULE_MEDIA = {
  // The twin shrines: each one's description says "see the screenshot for the pattern".
  'Shee Venath Shrine': ['screenshots/shee-venath-shrine.png'],
  'Shee Vaneer Shrine': ['screenshots/shee-vaneer-shrine.png'],

  // Other markers whose descriptions point at a screenshot (remove the // when you have the picture):
  // 'The Desert Labyrinth': ['screenshots/the-desert-labyrinth.png'],
  // 'Trial on the Cliff': ['screenshots/trial-on-the-cliff.png'],
  // 'Trial of the Labyrinth': ['screenshots/trial-of-the-labyrinth.png'],
  // 'The Two Rings': ['screenshots/the-two-rings.png'],
  // "Robbie's Research": ['screenshots/robbies-research.png'],
  // 'id:238069': ['screenshots/korok-seed-238069.png'],
};
