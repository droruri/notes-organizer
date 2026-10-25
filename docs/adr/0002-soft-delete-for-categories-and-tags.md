# Soft delete for categories and tags

Deleting a category or tag sets `deleted_at` instead of removing the row. A deleted one is not
offered for new notes, stays linked (shown disabled) on notes that already have it, and can be
restored. The user wanted a restore to be easy and old notes to keep their history; hard delete
would lose both. Consequence: name uniqueness only applies among active rows, and a restore fails
with `409` if an active one has taken the name.
