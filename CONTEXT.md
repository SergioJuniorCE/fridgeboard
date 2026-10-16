# Household Management

Shared life management for one family living as a single economic unit.

## Language

### Household

**Household**:
A single family unit that shares calendars, budgets, and lists.
_Avoid_: Family, home, group

**Member**:
A person belonging to a Household.
_Avoid_: User, account

**Adult**:
A Member with full legal capacity who can manage money and consent to integrations.
_Avoid_: Parent, grown-up

**Minor**:
A Member without full capacity whose actions may need Adult approval.
_Avoid_: Child, kid

**Admin**:
An Adult designated to manage Household membership and settings. Minors cannot be Admins.
_Avoid_: Owner, superuser

### Money

**Budget**:
A monthly spending envelope for a Category owned by the Household.
_Avoid_: Budget limit, pot

**Category**:
A spending grouping within a Budget, e.g. Groceries.
_Avoid_: Tag, envelope

**Expense**:
A recorded spend against a Category, entered manually.
_Avoid_: Purchase, transaction

**Receipt**:
A photo of a purchase proof linked to an Expense, used to pre-fill total and date.
_Avoid_: Scan, invoice

**Price Record**:
What the Household paid for a List Item at a Store on a date, used for price history.
_Avoid_: Price observation, cost entry

### Shopping

**Shopping List**:
A list of Items to buy, with an optional Spend Limit independent of the monthly Budget.
_Avoid_: Supermarket list, grocery list

**List Item**:
A single thing to buy, with a title, quantity, and optional Store.
_Avoid_: Product, entry

**Store**:
A place where a List Item is bought, e.g. a supermarket or online shop.
_Avoid_: Shop, vendor

### Calendar

**Family Calendar**:
The single shared Google Calendar owned by the Household for joint events.
_Avoid_: Shared calendar

**Family Event**:
An event on the Family Calendar visible to all Members.
_Avoid_: Appointment, task
