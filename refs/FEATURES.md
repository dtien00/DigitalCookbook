Features to possible implement during development

# Custom Tags for User (Different from General search tags for anon users)
- Allows the user to provide their own tags for recipes without clogging general feed with tags
    - Enables different courses such as [Soups, Deserts, [Monday/Tuesday/Wednesday/etc.], Single, Family]

# Introduce a Planner/Recipe queue
- Lets the user preplan meals for the week
- Can be extended to personal to restaurant usage and help keep on track (Potentially price tier this)

# Introduce Reasonable Like/Bookmark limits
- Allow more for paid members

# Introduce stylistic pallets for users
- Old Recipe Book
- Lined Notepad/Notebook

# Introduce an Admin Account *(done)*
- [x] Delete any recipe
- [x] Delete any user
- [x] Delete any comment on a recipe
- [x] Reset likes
- [x] Reset bookmarks

*Implemented on the `admin` branch. Schema (is_admin flag, override RLS, SECURITY DEFINER user-delete RPC) lives in [supabase_migration_008_admin.sql](../supabase_migration_008_admin.sql); UI controls land inline on RecipeDetail and Comments. See [refs/ROADMAP.md](./ROADMAP.md) Stage 7 entry for the full rationale and [refs/TESTING.md](./TESTING.md) for the admin test account.*

# Implement a "Fridge" mechanic
- Stores any inputted ingredients from the user that can be used to narrow down catalogue
    - Essentially helps users see what they could potentially make
## AI/Image recognition
- Takes a photo of ingredients, user manually confirms ingredients and can be used to determine what can be made from it
- Yield nutritional information based on ingredients

# Sharing Recipe
- Promotes outreach of application
- Each recipe has a share button that copies a link to the user's clipboard
    - The link should be to the website and the recipe
    - It should be independent of anon/signed users that access the link
