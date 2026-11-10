# Liwi-Ka admin website

The admin is redesigned in the premium cacao-black/champagne-gold visual direction and uses the same Firebase project `liwika-3719e` as the customer site.

- Google and India Phone OTP sign-in; admin routes require the Firebase Authentication custom claim `admin: true`.
- Dashboard, products, add/edit product, collections, visibility, orders, customers, inventory, feedback, support inbox, analytics, activity, settings and account are wired to Firestore.
- Product images upload to Firebase Storage. Deleting a product or replacing an image removes the previous stored object.
- Admin actions record activity in `activity_logs`.
- Store settings are shared with the customer catalogue. New order alerts can display in-app toasts and optional browser notifications.
- Analytics revenue counts only orders with `paymentStatus: "paid"`.

Deploy backend rules, indexes and Functions before publishing. Use `grant-admin-claim.cjs` from the backend package to grant the custom admin claim. See the backend deployment guide.

**Payment note:** online payment gateway processing is not included; do not mark an order paid until payment has been verified independently.

Product editor note: nutrition values are stored in the product document under `nutrition` (energy, fat, saturatedFat, carbohydrates, sugars, protein), and ingredients are stored in `ingredients`. Values are displayed in the customer product window as entered; enter label values and units accurately.
