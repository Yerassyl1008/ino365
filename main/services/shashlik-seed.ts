import type Database from 'better-sqlite3';
import { now } from '../db';

type SeedDb = Database.Database;
type SeedLanguage = 'en' | 'ru' | 'kk';

function loc(language: SeedLanguage, en: string, ru: string, kk: string): string {
  if (language === 'ru') return ru;
  if (language === 'kk') return kk;
  return en;
}

function insertCategory(db: SeedDb, id: string, name: string, color: string, icon: string, sortOrder: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order, is_active, business_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 'restaurant', ?, ?)
  `).run(id, name, color, icon, sortOrder, now(), now());
  db.prepare(`UPDATE categories SET business_scope = 'restaurant' WHERE id = ?`).run(id);
}

function insertProduct(db: SeedDb, id: string, categoryId: string, name: string, price: number, sortOrder: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO products (id, category_id, name, price, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, categoryId, name, price, sortOrder, now(), now());
}

function insertIngredient(
  db: SeedDb,
  id: string,
  name: string,
  unit: string,
  stock: number,
  low: number,
  cost: number,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO ingredients (
      id, name, unit, stock_quantity, low_stock_threshold, cost_per_unit, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, name, unit, stock, low, cost, now(), now());
}

function insertRecipe(db: SeedDb, productId: string, ingredientId: string, quantity: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO product_recipes (id, product_id, ingredient_id, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`recipe-${productId}-${ingredientId}`, productId, ingredientId, quantity, now(), now());
}

/**
 * Meyraman-style shashlik kitchen: grill dishes, lagman/plov/manti, salads,
 * bread, and drinks, each with a tech card that POS deducts from warehouse stock.
 */
export function seedShashlikMenu(db: SeedDb, language: SeedLanguage = 'en'): void {
  insertCategory(db, 'cat-demo-grill', loc(language, 'Shashlik', 'Шашлык', 'Шашлык'), '#E11D48', '🔥', 1);
  insertCategory(db, 'cat-demo-main', loc(language, 'Hot dishes', 'Горячие блюда', 'Ыстық тағамдар'), '#F97316', '🍲', 2);
  insertCategory(db, 'cat-demo-starters', loc(language, 'Salads', 'Салаты', 'Салаттар'), '#22C55E', '🥗', 3);
  insertCategory(db, 'cat-demo-sides', loc(language, 'Bread & sides', 'Хлеб и гарниры', 'Нан және гарнир'), '#A16207', '🍞', 4);
  insertCategory(db, 'cat-demo-sauces', loc(language, 'Sauces', 'Соусы', 'Соустар'), '#DC2626', '🫙', 5);
  insertCategory(db, 'cat-demo-beverages', loc(language, 'Beverages', 'Напитки', 'Сусындар'), '#0EA5E9', '🥤', 6);
  insertCategory(db, 'cat-demo-desserts', loc(language, 'Desserts', 'Выпечка', 'Тәтті нан'), '#F59E0B', '🥟', 7);

  insertProduct(db, 'prod-demo-shashlik-lamb', 'cat-demo-grill', loc(language, 'Lamb shashlik', 'Шашлык из баранины', 'Қой шашлығы'), 2800, 1);
  insertProduct(db, 'prod-demo-shashlik-beef', 'cat-demo-grill', loc(language, 'Beef shashlik', 'Шашлык из говядины', 'Сиыр шашлығы'), 2500, 2);
  insertProduct(db, 'prod-demo-shashlik-chicken', 'cat-demo-grill', loc(language, 'Chicken shashlik', 'Шашлык куриный', 'Тауық шашлығы'), 1800, 3);
  insertProduct(db, 'prod-demo-lyulya', 'cat-demo-grill', loc(language, 'Lyulya kebab', 'Люля-кебаб', 'Люля-кебаб'), 2200, 4);
  insertProduct(db, 'prod-demo-wings', 'cat-demo-grill', loc(language, 'Grilled wings', 'Крылышки на мангале', 'Мангалдағы қанаттар'), 1600, 5);
  insertProduct(db, 'prod-demo-liver', 'cat-demo-grill', loc(language, 'Liver shashlik', 'Шашлык из печени', 'Бауыр шашлығы'), 1700, 6);
  insertProduct(db, 'prod-demo-heart', 'cat-demo-grill', loc(language, 'Heart shashlik', 'Шашлык из сердца', 'Жүрек шашлығы'), 1700, 7);
  insertProduct(db, 'prod-demo-veg-grill', 'cat-demo-grill', loc(language, 'Grilled vegetables', 'Овощи на мангале', 'Мангалдағы көкөніс'), 1200, 8);
  insertProduct(db, 'prod-demo-mix-grill', 'cat-demo-grill', loc(language, 'Mixed grill platter', 'Ассорти на мангале', 'Мангал ассорти'), 6500, 9);
  insertProduct(db, 'prod-demo-extra-lamb', 'cat-demo-grill', loc(language, 'Extra lamb skewer', 'Доп. шампур баранины', 'Қосымша қой шампуры'), 1400, 10);

  insertProduct(db, 'prod-demo-lagman', 'cat-demo-main', loc(language, 'Lagman', 'Лагман', 'Лағман'), 1900, 1);
  insertProduct(db, 'prod-demo-plov', 'cat-demo-main', loc(language, 'Plov', 'Плов', 'Палау'), 1800, 2);
  insertProduct(db, 'prod-demo-manti', 'cat-demo-main', loc(language, 'Manti', 'Манты', 'Манты'), 1700, 3);
  insertProduct(db, 'prod-demo-shurpa', 'cat-demo-main', loc(language, 'Shurpa', 'Шурпа', 'Сорпа'), 1500, 4);
  insertProduct(db, 'prod-demo-kuyrdak', 'cat-demo-main', loc(language, 'Kuyrdak', 'Куырдак', 'Қуырдақ'), 2100, 5);
  insertProduct(db, 'prod-demo-samsa', 'cat-demo-main', loc(language, 'Meat samsa', 'Самса с мясом', 'Етті самса'), 700, 6);
  insertProduct(db, 'prod-demo-pelmeni', 'cat-demo-main', loc(language, 'Pelmeni', 'Пельмени', 'Пельмень'), 1400, 7);

  insertProduct(db, 'prod-demo-achichuk', 'cat-demo-starters', loc(language, 'Achichuk', 'Ачик-чучук', 'Ачык-чучук'), 900, 1);
  insertProduct(db, 'prod-demo-cabbage', 'cat-demo-starters', loc(language, 'Cabbage salad', 'Салат из капусты', 'Қырыққабат салаты'), 700, 2);
  insertProduct(db, 'prod-demo-olivier', 'cat-demo-starters', loc(language, 'Olivier salad', 'Салат «Оливье»', 'Оливье салаты'), 1100, 3);
  insertProduct(db, 'prod-demo-greek', 'cat-demo-starters', loc(language, 'Greek salad', 'Греческий салат', 'Грек салаты'), 1300, 4);
  insertProduct(db, 'prod-demo-cucumber-tomato', 'cat-demo-starters', loc(language, 'Cucumber-tomato salad', 'Салат из огурцов и помидоров', 'Қияр-қызанақ салаты'), 800, 5);

  insertProduct(db, 'prod-demo-lepeshka', 'cat-demo-sides', loc(language, 'Lepeshka', 'Лепёшка', 'Тандыр нан'), 300, 1);
  insertProduct(db, 'prod-demo-fries', 'cat-demo-sides', loc(language, 'French fries', 'Картофель фри', 'Фри картобы'), 800, 2);
  insertProduct(db, 'prod-demo-village-potato', 'cat-demo-sides', loc(language, 'Country potatoes', 'Картофель по-деревенски', 'Деревен картобы'), 900, 3);
  insertProduct(db, 'prod-demo-rice-side', 'cat-demo-sides', loc(language, 'Steamed rice', 'Рис отварной', 'Пісірілген күріш'), 500, 4);

  insertProduct(db, 'prod-demo-sauce-garlic', 'cat-demo-sauces', loc(language, 'Garlic sauce', 'Чесночный соус', 'Сарымсақ соусы'), 300, 1);
  insertProduct(db, 'prod-demo-sauce-tomato', 'cat-demo-sauces', loc(language, 'Tomato sauce', 'Томатный соус', 'Қызанақ соусы'), 300, 2);
  insertProduct(db, 'prod-demo-sauce-adjika', 'cat-demo-sauces', loc(language, 'Adjika', 'Аджика', 'Аджика'), 350, 3);

  insertProduct(db, 'prod-demo-milk-tea', 'cat-demo-beverages', loc(language, 'Milk tea', 'Чай с молоком', 'Сүтті шай'), 400, 1);
  insertProduct(db, 'prod-demo-black-tea', 'cat-demo-beverages', loc(language, 'Black tea', 'Чёрный чай', 'Қара шай'), 300, 2);
  insertProduct(db, 'prod-demo-ayran', 'cat-demo-beverages', loc(language, 'Ayran', 'Айран', 'Айран'), 500, 3);
  insertProduct(db, 'prod-demo-kompot', 'cat-demo-beverages', loc(language, 'Kompot', 'Компот', 'Компот'), 500, 4);
  insertProduct(db, 'prod-demo-lemonade', 'cat-demo-beverages', loc(language, 'Lemonade', 'Лимонад', 'Лимонад'), 600, 5);
  insertProduct(db, 'prod-demo-coffee', 'cat-demo-beverages', loc(language, 'Coffee', 'Кофе', 'Кофе'), 700, 6);
  insertProduct(db, 'prod-demo-cola', 'cat-demo-beverages', loc(language, 'Cola', 'Кола', 'Кола'), 500, 7);
  insertProduct(db, 'prod-demo-fanta', 'cat-demo-beverages', loc(language, 'Fanta', 'Фанта', 'Фанта'), 500, 8);
  insertProduct(db, 'prod-demo-water-bottle', 'cat-demo-beverages', loc(language, 'Water 0.5L', 'Вода 0,5 л', 'Су 0,5 л'), 400, 9);

  insertProduct(db, 'prod-demo-baursak', 'cat-demo-desserts', loc(language, 'Baursak', 'Баурсаки', 'Бауырсақ'), 600, 1);
  insertProduct(db, 'prod-demo-chakchak', 'cat-demo-desserts', loc(language, 'Chak-chak', 'Чак-чак', 'Шек-шек'), 800, 2);

  const ingredients: Array<[string, string, string, number, number, number]> = [
    ['ing-lamb', loc(language, 'Lamb', 'Баранина', 'Қой еті'), 'g', 20000, 2000, 4],
    ['ing-beef', loc(language, 'Beef', 'Говядина', 'Сиыр еті'), 'g', 15000, 1500, 3.5],
    ['ing-chicken', loc(language, 'Chicken', 'Курица', 'Тауық еті'), 'g', 15000, 1500, 2.2],
    ['ing-mince', loc(language, 'Minced meat', 'Фарш', 'Фарш'), 'g', 10000, 1000, 3],
    ['ing-fat', loc(language, 'Fat tail', 'Курдяк', 'Құйрық май'), 'g', 3000, 400, 2],
    ['ing-wings', loc(language, 'Chicken wings', 'Куриные крылья', 'Тауық қанаттары'), 'g', 8000, 800, 2],
    ['ing-rice', loc(language, 'Rice', 'Рис', 'Күріш'), 'g', 15000, 2000, 0.6],
    ['ing-flour', loc(language, 'Flour', 'Мука', 'Ұн'), 'g', 12000, 1500, 0.3],
    ['ing-noodle', loc(language, 'Lagman noodles', 'Лапша для лагмана', 'Лағман кеспесі'), 'g', 8000, 800, 0.8],
    ['ing-potato', loc(language, 'Potato', 'Картофель', 'Картоп'), 'g', 20000, 2000, 0.25],
    ['ing-onion', loc(language, 'Onion', 'Лук', 'Пияз'), 'g', 15000, 1500, 0.2],
    ['ing-carrot', loc(language, 'Carrot', 'Морковь', 'Сәбіз'), 'g', 8000, 800, 0.25],
    ['ing-pepper', loc(language, 'Bell pepper', 'Перец', 'Болгар бұрышы'), 'g', 5000, 500, 0.7],
    ['ing-tomato', loc(language, 'Tomato', 'Помидор', 'Қызанақ'), 'g', 10000, 1000, 0.5],
    ['ing-cabbage', loc(language, 'Cabbage', 'Капуста', 'Қырыққабат'), 'g', 8000, 800, 0.2],
    ['ing-greens', loc(language, 'Greens', 'Зелень', 'Көк'), 'g', 2000, 200, 1.2],
    ['ing-pickle', loc(language, 'Pickles', 'Соленья', 'Тұздалған қияр'), 'g', 3000, 300, 0.8],
    ['ing-peas', loc(language, 'Peas', 'Горошек', 'Бұршақ'), 'g', 2000, 200, 0.9],
    ['ing-egg', loc(language, 'Egg', 'Яйцо', 'Жұмыртқа'), 'pcs', 200, 24, 80],
    ['ing-mayo', loc(language, 'Mayonnaise', 'Майонез', 'Майонез'), 'g', 3000, 400, 1.1],
    ['ing-oil', loc(language, 'Oil', 'Масло', 'Май'), 'ml', 10000, 1000, 0.8],
    ['ing-spices', loc(language, 'Grill spices', 'Специи для мангала', 'Мангал дәмдеуіштері'), 'g', 2000, 200, 3],
    ['ing-tea', loc(language, 'Tea', 'Чай', 'Шай'), 'g', 1000, 100, 4],
    ['ing-water', loc(language, 'Water', 'Вода', 'Су'), 'ml', 50000, 5000, 0],
    ['ing-milk', loc(language, 'Milk', 'Молоко', 'Сүт'), 'ml', 10000, 1000, 0.4],
    ['ing-ayran', loc(language, 'Ayran', 'Айран', 'Айран'), 'ml', 20000, 2000, 0.4],
    ['ing-cola', loc(language, 'Cola bottle', 'Бутылка колы', 'Кола бөтелкесі'), 'pcs', 120, 12, 280],
    ['ing-liver', loc(language, 'Liver', 'Печень', 'Бауыр'), 'g', 5000, 500, 2.5],
    ['ing-heart', loc(language, 'Heart', 'Сердце', 'Жүрек'), 'g', 4000, 400, 2.5],
    ['ing-eggplant', loc(language, 'Eggplant', 'Баклажан', 'Баклажан'), 'g', 4000, 400, 0.6],
    ['ing-cucumber', loc(language, 'Cucumber', 'Огурец', 'Қияр'), 'g', 6000, 600, 0.4],
    ['ing-cheese', loc(language, 'Cheese', 'Сыр', 'Ірімшік'), 'g', 3000, 300, 2.8],
    ['ing-garlic', loc(language, 'Garlic', 'Чеснок', 'Сарымсақ'), 'g', 1500, 150, 1.5],
    ['ing-sugar', loc(language, 'Sugar', 'Сахар', 'Қант'), 'g', 5000, 500, 0.4],
    ['ing-lemon', loc(language, 'Lemon', 'Лимон', 'Лимон'), 'pcs', 80, 10, 150],
    ['ing-coffee', loc(language, 'Coffee', 'Кофе', 'Кофе'), 'g', 2000, 200, 6],
    ['ing-honey', loc(language, 'Honey', 'Мёд', 'Бал'), 'g', 2000, 200, 3],
    ['ing-fanta', loc(language, 'Fanta bottle', 'Бутылка фанты', 'Фанта бөтелкесі'), 'pcs', 80, 12, 280],
    ['ing-water-bottle', loc(language, 'Water bottle', 'Бутылка воды', 'Су бөтелкесі'), 'pcs', 100, 12, 120],
  ];
  for (const [id, name, unit, stock, low, cost] of ingredients) {
    insertIngredient(db, id, name, unit, stock, low, cost);
  }

  const recipes: Array<[string, string, number]> = [
    ['prod-demo-shashlik-lamb', 'ing-lamb', 180],
    ['prod-demo-shashlik-lamb', 'ing-onion', 40],
    ['prod-demo-shashlik-lamb', 'ing-oil', 10],
    ['prod-demo-shashlik-lamb', 'ing-spices', 5],

    ['prod-demo-shashlik-beef', 'ing-beef', 180],
    ['prod-demo-shashlik-beef', 'ing-onion', 40],
    ['prod-demo-shashlik-beef', 'ing-oil', 10],
    ['prod-demo-shashlik-beef', 'ing-spices', 5],

    ['prod-demo-shashlik-chicken', 'ing-chicken', 180],
    ['prod-demo-shashlik-chicken', 'ing-onion', 30],
    ['prod-demo-shashlik-chicken', 'ing-oil', 10],
    ['prod-demo-shashlik-chicken', 'ing-spices', 5],

    ['prod-demo-lyulya', 'ing-mince', 180],
    ['prod-demo-lyulya', 'ing-onion', 40],
    ['prod-demo-lyulya', 'ing-fat', 20],
    ['prod-demo-lyulya', 'ing-spices', 5],

    ['prod-demo-wings', 'ing-wings', 250],
    ['prod-demo-wings', 'ing-oil', 10],
    ['prod-demo-wings', 'ing-spices', 8],

    ['prod-demo-lagman', 'ing-noodle', 120],
    ['prod-demo-lagman', 'ing-beef', 80],
    ['prod-demo-lagman', 'ing-onion', 40],
    ['prod-demo-lagman', 'ing-pepper', 40],
    ['prod-demo-lagman', 'ing-tomato', 50],
    ['prod-demo-lagman', 'ing-oil', 15],

    ['prod-demo-plov', 'ing-rice', 120],
    ['prod-demo-plov', 'ing-lamb', 80],
    ['prod-demo-plov', 'ing-carrot', 60],
    ['prod-demo-plov', 'ing-onion', 40],
    ['prod-demo-plov', 'ing-oil', 20],

    ['prod-demo-manti', 'ing-flour', 80],
    ['prod-demo-manti', 'ing-water', 30],
    ['prod-demo-manti', 'ing-mince', 70],
    ['prod-demo-manti', 'ing-onion', 30],
    ['prod-demo-manti', 'ing-oil', 5],

    ['prod-demo-shurpa', 'ing-lamb', 100],
    ['prod-demo-shurpa', 'ing-potato', 80],
    ['prod-demo-shurpa', 'ing-onion', 40],
    ['prod-demo-shurpa', 'ing-carrot', 40],

    ['prod-demo-achichuk', 'ing-tomato', 150],
    ['prod-demo-achichuk', 'ing-onion', 50],
    ['prod-demo-achichuk', 'ing-greens', 10],
    ['prod-demo-achichuk', 'ing-oil', 10],

    ['prod-demo-cabbage', 'ing-cabbage', 120],
    ['prod-demo-cabbage', 'ing-oil', 10],

    ['prod-demo-olivier', 'ing-potato', 80],
    ['prod-demo-olivier', 'ing-carrot', 30],
    ['prod-demo-olivier', 'ing-egg', 1],
    ['prod-demo-olivier', 'ing-mayo', 30],
    ['prod-demo-olivier', 'ing-peas', 20],
    ['prod-demo-olivier', 'ing-pickle', 20],

    ['prod-demo-lepeshka', 'ing-flour', 80],
    ['prod-demo-lepeshka', 'ing-water', 40],
    ['prod-demo-lepeshka', 'ing-oil', 5],

    ['prod-demo-fries', 'ing-potato', 200],
    ['prod-demo-fries', 'ing-oil', 20],

    ['prod-demo-milk-tea', 'ing-tea', 3],
    ['prod-demo-milk-tea', 'ing-water', 250],
    ['prod-demo-milk-tea', 'ing-milk', 50],

    ['prod-demo-ayran', 'ing-ayran', 300],

    ['prod-demo-cola', 'ing-cola', 1],

    ['prod-demo-baursak', 'ing-flour', 70],
    ['prod-demo-baursak', 'ing-oil', 40],
    ['prod-demo-baursak', 'ing-water', 25],

    ['prod-demo-liver', 'ing-liver', 160],
    ['prod-demo-liver', 'ing-onion', 40],
    ['prod-demo-liver', 'ing-oil', 10],
    ['prod-demo-liver', 'ing-spices', 5],

    ['prod-demo-heart', 'ing-heart', 160],
    ['prod-demo-heart', 'ing-onion', 40],
    ['prod-demo-heart', 'ing-oil', 10],
    ['prod-demo-heart', 'ing-spices', 5],

    ['prod-demo-veg-grill', 'ing-pepper', 80],
    ['prod-demo-veg-grill', 'ing-tomato', 80],
    ['prod-demo-veg-grill', 'ing-onion', 60],
    ['prod-demo-veg-grill', 'ing-eggplant', 80],
    ['prod-demo-veg-grill', 'ing-oil', 15],

    ['prod-demo-mix-grill', 'ing-lamb', 120],
    ['prod-demo-mix-grill', 'ing-beef', 120],
    ['prod-demo-mix-grill', 'ing-chicken', 120],
    ['prod-demo-mix-grill', 'ing-onion', 80],
    ['prod-demo-mix-grill', 'ing-oil', 20],
    ['prod-demo-mix-grill', 'ing-spices', 12],

    ['prod-demo-extra-lamb', 'ing-lamb', 90],
    ['prod-demo-extra-lamb', 'ing-onion', 20],
    ['prod-demo-extra-lamb', 'ing-spices', 3],

    ['prod-demo-kuyrdak', 'ing-lamb', 150],
    ['prod-demo-kuyrdak', 'ing-onion', 60],
    ['prod-demo-kuyrdak', 'ing-potato', 80],
    ['prod-demo-kuyrdak', 'ing-oil', 15],

    ['prod-demo-samsa', 'ing-flour', 60],
    ['prod-demo-samsa', 'ing-mince', 50],
    ['prod-demo-samsa', 'ing-onion', 20],
    ['prod-demo-samsa', 'ing-oil', 10],

    ['prod-demo-pelmeni', 'ing-flour', 70],
    ['prod-demo-pelmeni', 'ing-mince', 60],
    ['prod-demo-pelmeni', 'ing-onion', 20],
    ['prod-demo-pelmeni', 'ing-water', 25],

    ['prod-demo-greek', 'ing-tomato', 80],
    ['prod-demo-greek', 'ing-cucumber', 80],
    ['prod-demo-greek', 'ing-onion', 30],
    ['prod-demo-greek', 'ing-cheese', 40],
    ['prod-demo-greek', 'ing-oil', 15],

    ['prod-demo-cucumber-tomato', 'ing-cucumber', 80],
    ['prod-demo-cucumber-tomato', 'ing-tomato', 80],
    ['prod-demo-cucumber-tomato', 'ing-oil', 10],
    ['prod-demo-cucumber-tomato', 'ing-greens', 5],

    ['prod-demo-village-potato', 'ing-potato', 250],
    ['prod-demo-village-potato', 'ing-oil', 25],
    ['prod-demo-village-potato', 'ing-spices', 5],

    ['prod-demo-rice-side', 'ing-rice', 150],
    ['prod-demo-rice-side', 'ing-oil', 5],

    ['prod-demo-sauce-garlic', 'ing-mayo', 40],
    ['prod-demo-sauce-garlic', 'ing-garlic', 8],
    ['prod-demo-sauce-garlic', 'ing-oil', 5],

    ['prod-demo-sauce-tomato', 'ing-tomato', 60],
    ['prod-demo-sauce-tomato', 'ing-spices', 3],
    ['prod-demo-sauce-tomato', 'ing-oil', 5],

    ['prod-demo-sauce-adjika', 'ing-pepper', 40],
    ['prod-demo-sauce-adjika', 'ing-tomato', 30],
    ['prod-demo-sauce-adjika', 'ing-garlic', 8],
    ['prod-demo-sauce-adjika', 'ing-oil', 5],

    ['prod-demo-black-tea', 'ing-tea', 3],
    ['prod-demo-black-tea', 'ing-water', 250],

    ['prod-demo-kompot', 'ing-water', 300],
    ['prod-demo-kompot', 'ing-sugar', 20],

    ['prod-demo-lemonade', 'ing-water', 300],
    ['prod-demo-lemonade', 'ing-lemon', 0.5],
    ['prod-demo-lemonade', 'ing-sugar', 25],

    ['prod-demo-coffee', 'ing-coffee', 12],
    ['prod-demo-coffee', 'ing-water', 180],
    ['prod-demo-coffee', 'ing-milk', 30],

    ['prod-demo-fanta', 'ing-fanta', 1],
    ['prod-demo-water-bottle', 'ing-water-bottle', 1],

    ['prod-demo-chakchak', 'ing-flour', 50],
    ['prod-demo-chakchak', 'ing-oil', 30],
    ['prod-demo-chakchak', 'ing-honey', 25],
  ];
  for (const [productId, ingredientId, quantity] of recipes) {
    insertRecipe(db, productId, ingredientId, quantity);
  }
}
